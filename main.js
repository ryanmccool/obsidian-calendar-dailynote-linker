"use strict";var K=Object.defineProperty;var He=Object.getOwnPropertyDescriptor;var Ye=Object.getOwnPropertyNames;var Be=Object.prototype.hasOwnProperty;var ze=(e,t)=>{for(var n in t)K(e,n,{get:t[n],enumerable:!0})},Oe=(e,t,n,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of Ye(t))!Be.call(e,r)&&r!==n&&K(e,r,{get:()=>t[r],enumerable:!(i=He(t,r))||i.enumerable});return e};var _e=e=>Oe(K({},"__esModule",{value:!0}),e);var Ft={};ze(Ft,{default:()=>_});module.exports=_e(Ft);var d=require("obsidian");var he=require("node:child_process"),fe=require("node:util");var u=class extends Error{constructor(t){super(t),this.name="CalendarPayloadValidationError"}};function A(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function C(e,t){if(typeof e!="string")throw new u(`${t} must be a string`);return e}function P(e,t){if(e!==null&&typeof e!="string")throw new u(`${t} must be a string or null`);return e}function I(e,t){let n=C(e,t);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(n)||Number.isNaN(Date.parse(n)))throw new u(`${t} must be a valid ISO date`);return n}function W(e){let t=C(e,"targetDate");if(!/^\d{4}-\d{2}-\d{2}$/.test(t))throw new u("targetDate must be YYYY-MM-DD");let[n,i,r]=t.split("-").map(Number),o=new Date(Date.UTC(n,i-1,r));if(o.getUTCFullYear()!==n||o.getUTCMonth()!==i-1||o.getUTCDate()!==r)throw new u("targetDate must be a valid calendar date");return t}function Ue(e){return/^(?:EventKit|Some EventKit) (?:calendar|event URL|event title|attendee|attendee display name|attendee email|attendee status) data is unavailable on this macOS\/source\.$/.test(e)}var je=new Set(["unknown","pending","accepted","declined","tentative","delegated","completed","in-process"]);function Ke(e,t){let n=C(e,`attendee ${t} status`);if(!je.has(n))throw new u(`attendee ${t} status is not a stable EventKit status`);return n}function We(e,t){if(!A(e))throw new u(`events attendee ${t} must be an object`);return{displayName:P(e.displayName,`attendee ${t} displayName`),email:P(e.email,`attendee ${t} email`),status:Ke(e.status,t)}}function Ze(e,t){if(!A(e))throw new u(`event ${t} must be an object`);let n=e.attendees;if(!Array.isArray(n))throw new u(`event ${t} attendees must be an array`);let i=I(e.start,`event ${t} start`),r=I(e.end,`event ${t} end`);if(Date.parse(r)<Date.parse(i))throw new u(`event ${t} end cannot precede start`);if(typeof e.allDay!="boolean")throw new u(`event ${t} allDay must be a boolean`);return{id:P(e.id,`event ${t} id`),calendar:P(e.calendar,`event ${t} calendar`),title:C(e.title,`event ${t} title`),start:i,end:r,allDay:e.allDay,url:P(e.url,`event ${t} url`),location:P(e.location,`event ${t} location`),notes:e.notes===null?null:(()=>{throw new u(`event ${t} notes must be null`)})(),attendees:n.map((o,a)=>We(o,a))}}function pe(e){let t;try{t=JSON.parse(e)}catch{throw new u("Calendar bridge output was not valid JSON")}return qe(t)}function qe(e){if(!A(e))throw new u("Calendar bridge output must be a JSON object");if(e.schemaVersion!==1)throw new u("Calendar bridge output has an unsupported schema version");if(!A(e.range))throw new u("Calendar bridge output range must be an object");let t=I(e.range.start,"range start"),n=I(e.range.end,"range end");if(Date.parse(n)<=Date.parse(t))throw new u("range end must be after range start");let i=C(e.range.timeZone,"range timeZone").trim();if(!i)throw new u("range timeZone cannot be empty");if(!Array.isArray(e.events))throw new u("Calendar bridge output events must be an array");if(!Array.isArray(e.warnings)||e.warnings.some(o=>typeof o!="string"))throw new u("Calendar bridge output warnings must be an array of strings");let r=e.warnings;return{schemaVersion:1,source:C(e.source,"source"),targetDate:W(e.targetDate),range:{start:t,end:n,timeZone:i},events:e.events.map((o,a)=>Ze(o,a)),warnings:r.map(o=>{if(!Ue(o))throw new u("Calendar bridge warnings may only describe unavailable optional EventKit data");return o})}}var me=`/*
 * Native EventKit JXA bridge.
 * JXA invokes run(argv); its return value is the only stdout produced by this script.
 */

var EVENTKIT_PERMISSION_MESSAGE = "Allow Calendar access in System Settings \u2192 Privacy & Security \u2192 Calendars.";
var EVENTKIT_AVAILABLE = true;
try {
  ObjC.import("EventKit");
} catch (error) {
  EVENTKIT_AVAILABLE = false;
}
var $block = typeof ObjC.block === "function" ? ObjC.block : null;

var EVENTKIT_AUTH_NOT_DETERMINED = 0;
var EVENTKIT_AUTH_RESTRICTED = 1;
var EVENTKIT_AUTH_DENIED = 2;
var EVENTKIT_AUTH_FULL_ACCESS = 3;
var EVENTKIT_AUTH_WRITE_ONLY = 4;
var EVENTKIT_PERMISSION_CODES = {
  denied: "EVENTKIT_PERMISSION_DENIED",
  restricted: "EVENTKIT_PERMISSION_RESTRICTED",
  writeOnly: "EVENTKIT_PERMISSION_WRITE_ONLY",
  timeout: "EVENTKIT_PERMISSION_REQUEST_TIMEOUT",
  unavailable: "EVENTKIT_PERMISSION_UNAVAILABLE"
};

function permissionError(code) {
  return new Error(code + ": " + EVENTKIT_PERMISSION_MESSAGE);
}

function warningOnce(warnings, message) {
  if (warnings.indexOf(message) === -1) warnings.push(message);
}

function unavailableWarning(subject) {
  return "EventKit " + subject + " data is unavailable on this macOS/source.";
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length ? value : null;
  try {
    var jsValue = value.js;
    if (typeof jsValue === "string") return jsValue.length ? jsValue : null;
  } catch (error) {
    // Some Objective-C values do not expose a .js conversion.
  }
  return null;
}

function readOptionalProperty(object, propertyName) {
  if (!object) return { available: false, value: null };
  try {
    var value = object[propertyName];
    return { available: value !== undefined, value: value === undefined ? null : value };
  } catch (error) {
    return { available: false, value: null };
  }
}

function readRequiredProperty(object, propertyName, label) {
  var result = readOptionalProperty(object, propertyName);
  if (!result.available || result.value === null || result.value === undefined) {
    throw new Error("EventKit " + label + " was unavailable.");
  }
  return result.value;
}

function readDate(value, label) {
  try {
    var seconds = value.timeIntervalSince1970;
    if (typeof seconds === "function") seconds = seconds();
    seconds = Number(seconds);
    if (!isFinite(seconds)) throw new Error("invalid timestamp");
    var date = new Date(seconds * 1000);
    if (isNaN(date.getTime())) throw new Error("invalid date");
    return date;
  } catch (error) {
    throw new Error("EventKit " + label + " was not a valid date.");
  }
}

function readRequiredDate(object, propertyName, label) {
  return readDate(readRequiredProperty(object, propertyName, label), label);
}

function readRequiredBoolean(object, propertyName, label) {
  var value = readRequiredProperty(object, propertyName, label);
  if (typeof value !== "boolean") throw new Error("EventKit " + label + " was not a boolean.");
  return value;
}

function readUrlString(value) {
  var text = stringOrNull(value);
  if (text !== null) return text;
  if (!value) return null;
  var absoluteString = readOptionalProperty(value, "absoluteString");
  return absoluteString.available ? stringOrNull(absoluteString.value) : null;
}

function normalizeMailto(value) {
  var text = readUrlString(value);
  if (text === null || !/^mailto:/i.test(text)) return null;
  var address = text.slice(7).split("?", 1)[0];
  try {
    address = decodeURIComponent(address);
  } catch (error) {
    // Keep the original address when a provider supplied an escaped value we cannot decode.
  }
  address = address.trim();
  return address.length ? address : null;
}

function readOptionalEventUrl(event, warnings) {
  var result = readOptionalProperty(event, "URL");
  if (!result.available) {
    warningOnce(warnings, unavailableWarning("event URL"));
    return null;
  }
  var url = readUrlString(result.value);
  if (result.value !== null && url === null) warningOnce(warnings, unavailableWarning("event URL"));
  return url;
}

function readOptionalCalendar(event, warnings) {
  var result = readOptionalProperty(event, "calendar");
  if (!result.available || result.value === null) {
    warningOnce(warnings, unavailableWarning("calendar"));
    return null;
  }
  var title = readOptionalProperty(result.value, "title");
  var calendarName = title.available ? stringOrNull(title.value) : null;
  if (calendarName === null && (!title.available || title.value !== null)) warningOnce(warnings, unavailableWarning("calendar"));
  return calendarName;
}

function collectionCount(collection) {
  if (!collection) return null;
  try {
    var count = Number(collection.count);
    return isFinite(count) && count >= 0 && Math.floor(count) === count ? count : null;
  } catch (error) {
    return null;
  }
}

function participantStatusString(value) {
  var status = Number(value);
  var names = ["unknown", "pending", "accepted", "declined", "tentative", "delegated", "completed", "in-process"];
  return isFinite(status) && names[status] ? names[status] : "unknown";
}

function readAttendees(event, warnings) {
  var attendeeResult = readOptionalProperty(event, "attendees");
  if (!attendeeResult.available || attendeeResult.value === null) {
    warningOnce(warnings, unavailableWarning("attendee"));
    return [];
  }

  var rawAttendees = attendeeResult.value;
  var count = collectionCount(rawAttendees);
  if (count === null || typeof rawAttendees.objectAtIndex !== "function") {
    warningOnce(warnings, unavailableWarning("attendee"));
    return [];
  }

  var attendees = [];
  for (var index = 0; index < count; index += 1) {
    var participant;
    try {
      participant = rawAttendees.objectAtIndex(index);
    } catch (error) {
      warningOnce(warnings, "Some EventKit attendee data is unavailable on this macOS/source.");
      continue;
    }
    if (!participant) {
      warningOnce(warnings, "Some EventKit attendee data is unavailable on this macOS/source.");
      continue;
    }

    var nameResult = readOptionalProperty(participant, "name");
    var displayName = nameResult.available ? stringOrNull(nameResult.value) : null;
    if (!nameResult.available || (displayName === null && nameResult.value !== null)) warningOnce(warnings, unavailableWarning("attendee display name"));

    var urlResult = readOptionalProperty(participant, "URL");
    var email = urlResult.available ? normalizeMailto(urlResult.value) : null;
    if (!urlResult.available || (urlResult.value !== null && readUrlString(urlResult.value) === null)) warningOnce(warnings, unavailableWarning("attendee email"));

    var statusResult = readOptionalProperty(participant, "participantStatus");
    var status = statusResult.available ? participantStatusString(statusResult.value) : "unknown";
    if (!statusResult.available) warningOnce(warnings, unavailableWarning("attendee status"));

    attendees.push({
      displayName: displayName,
      email: email,
      status: status
    });
  }
  return attendees;
}

function localDate(targetDate) {
  var parts = targetDate.split("-").map(Number);
  var year = parts[0];
  var month = parts[1];
  var day = parts[2];
  var calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  calendarDate.setUTCHours(0, 0, 0, 0);
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) {
    throw new Error("Calendar target date must be a valid calendar date.");
  }

  var rangeStart = new Date(0);
  rangeStart.setFullYear(year, month - 1, day);
  rangeStart.setHours(0, 0, 0, 0);
  if (rangeStart.getFullYear() !== year || rangeStart.getMonth() !== month - 1 || rangeStart.getDate() !== day) {
    throw new Error("Calendar target date must be a valid local date.");
  }
  var rangeEnd = new Date(rangeStart.getTime());
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  rangeEnd.setHours(0, 0, 0, 0);
  return { start: rangeStart, end: rangeEnd };
}

function timeZoneName() {
  try {
    var timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone) return timeZone;
  } catch (error) {
    // Fall through to a stable non-empty value accepted by the payload schema.
  }
  return "local";
}

function authorizationStatus() {
  if (!EVENTKIT_AVAILABLE) throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
  try {
    var status = Number($.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent));
    if (!isFinite(status)) throw new Error("invalid authorization status");
    return status;
  } catch (error) {
    throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
  }
}

function waitForPermissionRequest(completionFinished, store) {
  var deadline = Date.now() + 120000;
  try {
    var runLoop = $.NSRunLoop.currentRunLoop;
    while (!completionFinished.value && Date.now() < deadline) {
      var remaining = (deadline - Date.now()) / 1000;
      var interval = Math.min(0.25, remaining);
      runLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(interval));
    }
  } catch (error) {
    throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
  }
  if (!completionFinished.value) throw permissionError(EVENTKIT_PERMISSION_CODES.timeout);
}

function requestEventKitAccess(store, currentStatus) {
  var completionFinished = { value: false };
  var granted = { value: false };
  var completion;
  try {
    if (typeof $block !== "function") throw new Error("JXA block support is unavailable");
    completion = $block("void, bool, id", function (accessGranted, error) {
      granted.value = Boolean(accessGranted);
      completionFinished.value = true;
    });
  } catch (error) {
    throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
  }

  if (currentStatus === EVENTKIT_AUTH_WRITE_ONLY && typeof store.requestFullAccessToEventsWithCompletion !== "function") {
    // Older EventKit cannot upgrade an existing write-only grant to read access.
    throw permissionError(EVENTKIT_PERMISSION_CODES.writeOnly);
  }

  try {
    if (typeof store.requestFullAccessToEventsWithCompletion === "function") {
      store.requestFullAccessToEventsWithCompletion(completion);
    } else if (typeof store.requestAccessToEntityTypeCompletion === "function") {
      store.requestAccessToEntityTypeCompletion($.EKEntityTypeEvent, completion);
    } else {
      throw new Error("EventKit permission request is unavailable");
    }
  } catch (error) {
    throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
  }

  waitForPermissionRequest(completionFinished, store);
  var status = authorizationStatus();
  if (status === EVENTKIT_AUTH_FULL_ACCESS && granted.value) return;
  if (status === EVENTKIT_AUTH_WRITE_ONLY) throw permissionError(EVENTKIT_PERMISSION_CODES.writeOnly);
  if (status === EVENTKIT_AUTH_RESTRICTED) throw permissionError(EVENTKIT_PERMISSION_CODES.restricted);
  if (status === EVENTKIT_AUTH_DENIED || !granted.value) throw permissionError(EVENTKIT_PERMISSION_CODES.denied);
  throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
}

function eventStore() {
  var status = authorizationStatus();
  if (status === EVENTKIT_AUTH_DENIED) throw permissionError(EVENTKIT_PERMISSION_CODES.denied);
  if (status === EVENTKIT_AUTH_RESTRICTED) throw permissionError(EVENTKIT_PERMISSION_CODES.restricted);
  if (status !== EVENTKIT_AUTH_NOT_DETERMINED && status !== EVENTKIT_AUTH_FULL_ACCESS && status !== EVENTKIT_AUTH_WRITE_ONLY) {
    throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
  }

  var store;
  try {
    store=$.EKEventStore.alloc.initWithAccessToEntityTypes($.EKEntityMaskEvent);
  } catch (error) {
    throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
  }
  if (status === EVENTKIT_AUTH_NOT_DETERMINED || status === EVENTKIT_AUTH_WRITE_ONLY) requestEventKitAccess(store, status);
  return store;
}

function readEventTitle(event, warnings) {
  var result = readOptionalProperty(event, "title");
  if (!result.available) warningOnce(warnings, unavailableWarning("event title"));
  return result.available ? stringOrNull(result.value) || "(Untitled event)" : "(Untitled event)";
}

function main(targetDate) {
  if (typeof targetDate !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(targetDate)) {
    throw new Error("Calendar target date must be YYYY-MM-DD.");
  }
  var range = localDate(targetDate);
  var warnings = [];
  var store = eventStore();
  var start = $.NSDate.dateWithTimeIntervalSince1970(range.start.getTime() / 1000);
  var end = $.NSDate.dateWithTimeIntervalSince1970(range.end.getTime() / 1000);
  var predicate;
  try {
    predicate=store.predicateForEventsWithStartDateEndDateCalendars(start,end,null);
  } catch (error) {
    // Some JXA runtimes bridge a literal null as NSNull; undefined supplies Objective-C nil there.
    try {
      predicate=store.predicateForEventsWithStartDateEndDateCalendars(start,end,undefined);
    } catch (fallbackError) {
      throw new Error("EventKit predicate creation failed.");
    }
  }
  var rawEvents;
  try {
    rawEvents = store.eventsMatchingPredicate(predicate);
  } catch (error) {
    throw new Error("EventKit event query failed.");
  }
  var eventCount = collectionCount(rawEvents);
  if (eventCount === null || typeof rawEvents.objectAtIndex !== "function") {
    throw new Error("EventKit returned an invalid event collection.");
  }

  var events = [];
  for (var index = 0; index < eventCount; index += 1) {
    var event;
    try {
      event = rawEvents.objectAtIndex(index);
    } catch (error) {
      throw new Error("EventKit could not read an event.");
    }
    if (!event) throw new Error("EventKit returned an empty event.");

    var eventIdentifier = readOptionalProperty(event, "eventIdentifier");
    var eventId = eventIdentifier.available ? stringOrNull(eventIdentifier.value) : null;
    var title = readEventTitle(event, warnings);
    var eventStart = readRequiredDate(event, "startDate", "event start date");
    var eventEnd = readRequiredDate(event, "endDate", "event end date");
    var allDay = readRequiredBoolean(event, "allDay", "event all-day value");
    if (eventEnd.getTime() < eventStart.getTime()) throw new Error("EventKit returned an event whose end precedes its start.");

    var calendarName = readOptionalCalendar(event, warnings);
    var url = readOptionalEventUrl(event, warnings);

    events.push({
      id: eventId,
      calendar: calendarName,
      title: title,
      start: eventStart.toISOString(),
      end: eventEnd.toISOString(),
      allDay: allDay,
      url: url,
      location: null,
      notes: null,
      attendees: readAttendees(event, warnings)
    });
  }

  return JSON.stringify({
    schemaVersion: 1,
    source: "EventKit",
    targetDate: targetDate,
    range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      timeZone: timeZoneName()
    },
    events: events,
    warnings: warnings
  });
}

function run(argv) {
  if (!argv || argv.length !== 1) throw new Error("Calendar target date argument is required.");
  return main(argv[0]);
}
`;var Je=(0,fe.promisify)(he.execFile),Ge=async(e,t,n)=>await Je(e,t,n),y=class extends Error{constructor(t,n=!1){super(t),this.name="CalendarBridgeError",this.isPermissionFailure=n}},Qe=/\bEVENTKIT_PERMISSION_(?:DENIED|RESTRICTED|WRITE_ONLY|REQUEST_TIMEOUT|UNAVAILABLE)\b/;function $(e){return typeof e!="string"?"":e.replace(/[\u0000-\u001f\u007f-\u009f]/gu," ").replace(/\s+/gu," ").trim().slice(0,500)}function J(e){return(typeof e=="string"?e.match(Qe):null)?.[0]??null}function Z(e){return`EventKit Calendar permission failed (${e}). Allow Calendar access in System Settings \u2192 Privacy & Security \u2192 Calendars, then try again.`}function q(e){return`EventKit bridge failed: ${e||"no diagnostic details were returned."}`}function Xe(e){let t=e,n=$(t?.stderr),i=$(t?.message);return{details:n||i,code:J(`${n} ${i}`)}}async function ve(e,t=Ge){try{W(e)}catch(r){throw new y(r instanceof Error?r.message:"Calendar target date must be YYYY-MM-DD.")}let n;try{n=await t("/usr/bin/osascript",["-l","JavaScript","-e",me,e],{encoding:"utf8",timeout:3e4,maxBuffer:2*1024*1024,shell:!1,windowsHide:!0})}catch(r){let o=Xe(r);throw o.code?new y(Z(o.code),!0):new y(q(o.details))}let i=n.stdout.trim();if(!i){let r=$(n.stderr),o=J(n.stderr);throw o?new y(Z(o),!0):new y(q(r))}try{let r=pe(i);if(r.targetDate!==e)throw new Error(`Calendar bridge returned ${r.targetDate} instead of ${e}.`);return r}catch(r){let o=$(r instanceof Error?r.message:String(r)),a=$(n.stderr),s=J(`${a} ${o}`);throw s?new y(Z(s),!0):new y(q([a,o].filter(Boolean).join(" | ")))}}function et(){return{byEmail:new Map,byName:new Map}}function we(e,t){return e?t():et()}function G(e,t,n){if(!t)return;let i=e.get(t)??[];i.some(r=>r.path===n.path)||(i.push(n),i.sort((r,o)=>r.path.localeCompare(o.path))),e.set(t,i)}function V(e){return e.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase()}function ye(e){return e.normalize("NFKC").trim().replace(/\s+/gu,"").toLowerCase()}function Q(e,t){let n=e?.[t];return typeof n=="string"?[n]:Array.isArray(n)?n.filter(i=>typeof i=="string"):[]}function tt(e){let t=e.path.replaceAll("\\","/"),n=e.basename||t.split("/").at(-1)?.replace(/\.md$/i,"")||"";return{path:t,basename:n,file:e.file}}function nt(e,t){let n=e.replaceAll("\\","/");return t.some(i=>{let r=i.replaceAll("\\","/").replace(/\/+$/u,"");return n===r||n.startsWith(`${r}/`)})}function ke(e,t){let n=new Map,i=new Map;for(let r of e){let o=r.path.replaceAll("\\","/");if(!o.toLowerCase().endsWith(".md")||nt(o,t))continue;let a=tt(r);G(i,V(a.basename),a);for(let s of Q(r.frontmatter,"aliases"))G(i,V(s),a);for(let s of[...Q(r.frontmatter,"email"),...Q(r.frontmatter,"emails")])G(n,ye(s),a)}return{byEmail:n,byName:i}}function rt(e,t){let n=t.email?ye(t.email):"";if(n){let o=e.byEmail.get(n);if(o?.length===1)return o[0];if(o&&o.length>1)return null}let i=t.displayName?V(t.displayName):"";if(!i)return null;let r=e.byName.get(i);return r?.length===1?r[0]:null}function it(e,t){let n=[];for(let i of t){let r=rt(e,i);r&&!n.some(o=>o.path===r.path)&&n.push(r)}return n}function X(e,t,n){let i=it(e,t);if(i.length>0)return i;let r=e.byName.get(V(n));return r?.length===1?[r[0]]:[]}function De(e,t){let n=new Map,i=r=>r.map(o=>{let a=n.get(o.path);return a===void 0&&(a=t(o),n.set(o.path,a)),{...o,markdownLink:a}});return{byEmail:new Map([...e.byEmail].map(([r,o])=>[r,i(o)])),byName:new Map([...e.byName].map(([r,o])=>[r,i(o)]))}}var N="<!-- calendar-daily-note-linker:start -->",E="<!-- calendar-daily-note-linker:end -->",T=class extends Error{constructor(t){super(t),this.name="CalendarBlockError"}};function ee(e){return[N,...e.map(be),E].join(`
`)}function L(e){let t=ot(e),n=[],i=[];for(let r of t){let o=r.content===N,a=r.content===E;if(o&&n.push(r),a&&i.push(r),(r.content.includes(N)||r.content.includes(E))&&!o&&!a)throw new T("The Calendar section marker must be on an exact standalone line.")}if(n.length===0&&i.length===0)return null;if(n.length!==1||i.length!==1||n[0].start>=i[0].start)throw new T("The Calendar section markers are duplicated, incomplete, or out of order.");return{start:n[0].start,end:i[0].next}}function te(e){let t=L(e);return t?`${e.slice(0,t.start)}${e.slice(t.end)}`:e}function ne(e){let t=e.split(`
`).map(n=>n.endsWith("\r")?n.slice(0,-1):n);if(t[0]!==N||t[t.length-1]!==E)throw new T("Generated Calendar content has invalid section markers.");if(t.slice(1,-1).some(n=>n.includes(N)||n.includes(E)))throw new T("Generated Calendar content contains a section marker literal.")}function be(e){return e.replace(/\r\n?|\n|\u2028|\u2029/gu," ").replace(/[\u0000-\u001f\u007f-\u009f]/gu,"").replaceAll(N,"[calendar section start]").replaceAll(E,"[calendar section end]")}function S(e){return be(e).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replace(/[\\`*_{}\[\]()#+\-.!|>~]/gu,"\\$&")}function ot(e){let t=e.split(`
`),n=[],i=0;for(let r of t){let o=r.endsWith("\r")?r.slice(0,-1):r,a=i+r.length;n.push({raw:r,content:o,start:i,end:a,next:Math.min(e.length,a+1)}),i=a+1}return n}var at={eventHeadingLevel:2,timeFormat:"24-hour",linkMatchingVaultNotes:!0,linkEventTitles:!0};function xe(e){return e.replaceAll("\\","\\\\").replace(/[\s<>]/gu,t=>encodeURIComponent(t)).replaceAll("(","\\(").replaceAll(")","\\)").replaceAll('"',"%22")}function Pe(e){if(!e?.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(e)||e.includes("<!-- calendar-daily-note-linker:start -->")||e.includes("<!-- calendar-daily-note-linker:end -->"))return null;try{let t=new URL(e.trim());return t.protocol==="http:"||t.protocol==="https:"?t.href:null}catch{return null}}function Ce(e,t){if(e.allDay!==t.allDay)return e.allDay?-1:1;let n=Date.parse(e.start)-Date.parse(t.start);if(n!==0)return n;let i=Date.parse(e.end)-Date.parse(t.end);return i!==0?i:e.title.localeCompare(t.title)}function R(e,t,n="24-hour"){let i={timeZone:t,hour:"numeric",minute:"2-digit",hour12:n==="12-hour",...n==="24-hour"?{hourCycle:"h23"}:{}};try{return new Intl.DateTimeFormat("en-US",i).format(new Date(e))}catch{return new Intl.DateTimeFormat("en-US",{...i,timeZone:void 0}).format(new Date(e))}}function st(e){return S(e).replaceAll("\\-","-")}function lt(e,t,n,i){let r=i.linkEventTitles?Pe(e.url):null,o=st(e.title),a=r?`[${o}](${xe(r)})`:o,l=(i.linkMatchingVaultNotes?X(n,e.attendees,e.title):[]).map(m=>m.markdownLink).filter(m=>!!m),c=`${"#".repeat(i.eventHeadingLevel)} ${a}${l.length?` \u2014 ${l.join(", ")}`:""}`,p=e.allDay?"All day":`${R(e.start,t.range.timeZone,i.timeFormat)} \u2013 ${R(e.end,t.range.timeZone,i.timeFormat)}`;return{lines:[c,p],linkCount:l.length}}function dt(e,t,n){let i=[],r=[...e.events].sort(Ce),o=0;if(!r.length)i.push(`No Calendar events found for ${e.targetDate}.`);else for(let a of r){let s=lt(a,e,t,n);i.push(...s.lines),o+=s.linkCount}return{block:ee(i),eventCount:r.length,linkCount:o}}function ct(e,t,n){let i=[t],r=[...e.events].sort(Ce),o=0;if(!r.length)i.push(`No Calendar events found for ${e.targetDate}.`);else for(let a of r){let s=Pe(a.url),l=s?`[${S(a.title)}](${xe(s)})`:S(a.title),c=X(n,a.attendees,a.title).map(m=>m.markdownLink).filter(m=>!!m),p=a.allDay?"All day":`${R(a.start,e.range.timeZone,"12-hour")}\u2013${R(a.end,e.range.timeZone,"12-hour")}`;i.push(`${l}${c.length?` \u2014 ${c.join(", ")}`:""}`),i.push(p),o+=c.length}return{block:ee(i),eventCount:r.length,linkCount:o}}function Ne(e,t,n){return typeof t=="string"?ct(e,t,n):dt(e,t,{...at,...n})}function ut(e){return/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(e)}function re(e){return!e||/[\r\n\u2028\u2029]/u.test(e)||ut(e)?!1:/^#{1,6}[ \t]+\S(?:.*)$/u.test(e.trim())}function gt(e){let t=/^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(e);if(!t)return null;let n=t[2];return{character:n[0],length:n.length}}function pt(e,t){return new RegExp(`^ {0,3}${t.character}{${t.length},}[ \\t]*$`,"u").test(e)}function ie(e){let t=e.split(`
`),n=[],i=0,r=t.length>0&&t[0].replace(/^\ufeff/u,"").trim()==="---",o=null;for(let a of t){let s=a.endsWith("\r")?a.slice(0,-1):a,l=i+s.length;if(r){i!==0&&(s.trim()==="---"||s.trim()==="...")&&(r=!1),i+=a.length+1;continue}if(o){pt(s,o)&&(o=null),i+=a.length+1;continue}let c=gt(s);if(c){let m=s.replace(/^ {0,3}(`{3,}|~{3,})/u,"");(c.character==="~"||!m.includes("`"))&&(o=c),i+=a.length+1;continue}if(/^(?: {4}|\t)/u.test(s)){i+=a.length+1;continue}let p=s.trim();re(p)&&n.push({text:p,start:i,contentEnd:l}),i+=a.length+1}return n}var w={excludedVaultFolders:[],insertionMode:"heading",insertionHeading:"# Notes",eventHeadingLevel:2,timeFormat:"24-hour",linkMatchingVaultNotes:!0,linkEventTitles:!0},oe=class extends Error{constructor(){super("Vault folder exclusions are malformed. Correct them in settings before importing Calendar events."),this.name="ExcludedVaultFolderError"}};function mt(e){let t=e.replaceAll("\\","/"),n=t.split("/");if(!(!t||t.startsWith("/")||/^[A-Za-z]:/.test(t)||n.some(i=>i.length===0||i==="."||i===".."||i.includes("\0"))))return t}function H(e){let t=Array.isArray(e),n=typeof e=="string"?e.split(/\r\n?|\n|\u2028|\u2029/gu):t&&e.every(r=>typeof r=="string")?e:void 0;if(!n)return;let i=[];for(let r of n){if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(r))return;if(!r.trim())continue;let o=mt(r);if(!o)return;i.includes(o)||i.push(o)}return i}function Ee(e){if(e===void 0)return w.excludedVaultFolders;let t=H(e);if(!t)throw new oe;return t}function ht(e){if(e===void 0)return{folders:[],malformed:!1};let t=H(e);return t?{folders:t,malformed:!1}:{folders:[],malformed:!0,rawInput:typeof e=="string"?e:Array.isArray(e)?e.map(String).join(`
`):String(e)}}function Y(e){if(typeof e!="string"||/[\r\n\u2028\u2029]/u.test(e)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(e))return;let t=e.trim();if(!(!re(t)||t.includes("<!--")||t.includes("-->")||t.includes("\0")))return t}function ft(e){return Y(e)??w.insertionHeading}function B(e){return e==="heading"||e==="cursor"?e:void 0}function vt(e){return B(e)??w.insertionMode}function z(e){let t=typeof e=="string"&&/^\d+$/u.test(e)?Number(e):e;return t===2||t===3||t===4||t===5||t===6?t:void 0}function wt(e){return z(e)??w.eventHeadingLevel}function O(e){return e==="24-hour"||e==="12-hour"?e:void 0}function yt(e){return O(e)??w.timeFormat}function F(e,t){return typeof e=="boolean"?e:t}function Te(e){let t=typeof e=="object"&&e!==null&&!Array.isArray(e)?e:{},n=t.insertionHeading;return{excludedVaultFolders:ht(t.excludedVaultFolders),insertionMode:vt(t.insertionMode),insertionHeading:ft(n),eventHeadingLevel:wt(t.eventHeadingLevel),timeFormat:yt(t.timeFormat),linkMatchingVaultNotes:F(t.linkMatchingVaultNotes,w.linkMatchingVaultNotes),linkEventTitles:F(t.linkEventTitles,w.linkEventTitles)}}var g=class extends Error{constructor(t){super(t),this.name="ActiveDailyNoteError"}};function kt(e){return(e??"").replaceAll("\\","/").replace(/\/+$/u,"")}function Dt(e){let t=[],n=0;for(;n<e.length;){if(e[n]==="\\"){n+=2;continue}if(e[n]==="["){let i=e.indexOf("]",n+1);n=i===-1?e.length:i+1;continue}if(/[YMD]/u.test(e[n])){let i=n,r=e[n];for(;n<e.length&&e[n]===r&&n-i<5;)n+=1;t.push({token:e.slice(i,n),start:i,end:n});continue}n+=1}return t}function bt(e){if(typeof e!="string"||!e)return!1;let t=Dt(e),n=t.filter(({token:s})=>s.startsWith("D")),i=n.some(({token:s})=>s.length>=3),r=n.some(({token:s})=>s.length<=2),o=t.some(({token:s})=>s.startsWith("M"));return!t.some(({token:s})=>s.startsWith("Y"))||!(i||o&&r)?!1:t.some(({token:s})=>s==="YYYY")}function xt(e,t){let n=e.replaceAll("\\","/"),i=t?`${t}/`:"";if(t&&!n.startsWith(i))throw new g("The active note is outside the configured core Daily Notes folder.");let r=n.slice(i.length);if(!r.endsWith(".md"))throw new g("The active note must be a Markdown Daily Note.");return r.slice(0,-3)}function Me(e,t,n,i,r){if(e.extension.toLowerCase()!=="md")throw new g("Open an existing configured Daily Note before running this command.");if(!bt(t.format))throw new g("The core Daily Notes filename format cannot identify one calendar date.");let o=kt(t.folder),a=t.format,s=xt(e.path,o),l=n(s,a,!0);if(!l?.isValid()||l.format(a)!==s){if(!r)throw new g("The active note path is not the canonical core Daily Note for one date.");let m=n(s,a,!1);if(!m?.isValid())throw new g("The active note path is not the canonical core Daily Note for one date.");let D=$e(s,a,m.format("YYYY-MM-DD"),r);if(D.length!==1)throw new g("The active note path can represent more than one calendar date.");l=D[0]}let c=`${o?`${o}/`:""}${l.format(a)}.md`;if(e.path.replaceAll("\\","/")!==c)throw new g("The active note path is not the canonical core Daily Note path.");if(!r||Ct(s,a,l,r))throw new g("The active note path can represent more than one calendar date.");if(i&&!a.includes("/")){let m=i(e,"day");if(m?.isValid()&&m.format("YYYY-MM-DD")!==l.format("YYYY-MM-DD"))throw new g("The active note date could not be confirmed by core Daily Notes.")}let p=l.format("YYYY-MM-DD");if(!/^\d{4}-\d{2}-\d{2}$/u.test(p))throw new g("The active note did not resolve to one calendar date.");return p}function Pt(e,t){let n=new Date(Date.UTC(e,0,1+t));return`${String(n.getUTCFullYear()).padStart(4,"0")}-${String(n.getUTCMonth()+1).padStart(2,"0")}-${String(n.getUTCDate()).padStart(2,"0")}`}function $e(e,t,n,i){let r=Number(n.slice(0,4)),o=[],a=[r-100,r-1,r,r+1,r+100];for(let s of a){let l=new Date(Date.UTC(s,1,29)).getUTCDate()===29?366:365;for(let c=0;c<l;c+=1){let p=i(Pt(s,c));p?.isValid()&&p.format(t)===e&&o.push(p)}}return o}function Ct(e,t,n,i){let r=n.format("YYYY-MM-DD");return $e(e,t,r,i).some(a=>a.format("YYYY-MM-DD")!==r)}function Fe(e,t,n,i,r,o){if(!t||t!==e||t.path!==e.path||t.basename!==e.basename)throw new g("The active Daily Note changed, moved, or was deleted; import aborted before writing.");if((n.folder??"")!==(i.folder??"")||(n.format??"")!==(i.format??"")||(n.template??"")!==(i.template??"")||r!==o)throw new g("The active Daily Note or core Daily Notes configuration changed; import aborted before writing.")}function Nt(e){return e.insertionMode==="heading"?`below ${e.insertionHeading}`:"at the active editor cursor"}function Et(e){let t=[e.linkMatchingVaultNotes?"matching vault notes on":"matching vault notes off",e.linkEventTitles?"event title links on":"event title links off"];return`Heading ${e.eventHeadingLevel}, ${e.timeFormat}, ${t.join(", ")}`}function Ae(e,t,n,i,r){if(!r){if(n===0)return`No Calendar events found for ${e}. The active Daily Note was updated.`;let c=n===1?"event":"events";return i===0?`Imported ${n} Calendar ${c} into ${t}. No attendees or event titles uniquely matched vault notes.`:`Imported ${n} Calendar ${c} into ${t} and added ${i} vault ${i===1?"link":"links"}.`}let o=`${Nt(r)}; ${Et(r)}; managed block relocated`;if(n===0)return`No Calendar events found for ${e}; updated ${t} (${o}).`;let a=n===1?"event":"events",l=i===0?r.linkMatchingVaultNotes?"No attendees or event titles uniquely matched vault notes.":"Vault-note matching links are disabled.":`Added ${i} vault ${i===1?"link":"links"}.`;return`Imported ${n} Calendar ${a} into ${t} (${o}). ${l}`}var v=class extends Error{constructor(t,n){super(n),this.name="DailyNoteProviderCompatibilityError",this.kind=t}},M=class extends Error{constructor(t){super(t),this.name="DailyNoteProviderError"}};function k(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function ae(e,t,n,i){let r=e[t];if(r===void 0)return n;if(typeof r!="string")throw new v(i,`${i==="core"?"Core Daily Notes":"Periodic Notes"} ${t} setting has an unsupported shape.`);return t==="format"&&r.trim()===""?n:t==="folder"||t==="template"?r.trim():r}function Ie(e,t){return{folder:ae(e,"folder","",t),format:ae(e,"format","YYYY-MM-DD",t),template:ae(e,"template","",t)}}function se(e){if(!k(e))return{candidates:[],errors:[new v("core","Core Daily Notes provider shape is unavailable.")]};let t=[],n=[];try{let r=(k(e.internalPlugins)&&k(e.internalPlugins.plugins)?e.internalPlugins.plugins:void 0)?.["daily-notes"];if(k(r)&&r.enabled===!0)if(!k(r.instance)||!k(r.instance.options))n.push(new v("core","Core Daily Notes settings/options are unavailable or unsupported."));else try{t.push({kind:"core",settings:Ie(r.instance.options,"core")})}catch(o){o instanceof v?n.push(o):n.push(new v("core","Core Daily Notes settings could not be read safely."))}}catch{n.push(new v("core","Core Daily Notes provider shape is unavailable or unsupported."))}try{let i=k(e.plugins)?e.plugins:void 0,r=i&&typeof i.getPlugin=="function"?i.getPlugin.bind(i):void 0;if(!r)return{candidates:t,errors:[...n,new v("periodic","Periodic Notes provider shape is unavailable or unsupported.")]};let o=r?.("periodic-notes");if(o!==void 0){if(!k(o)||!k(o.settings)||!k(o.settings.daily))n.push(new v("periodic","Periodic Notes daily settings are unavailable or unsupported."));else if(o.settings.daily.enabled===!0)try{t.push({kind:"periodic",settings:Ie(o.settings.daily,"periodic")})}catch(a){a instanceof v?n.push(a):n.push(new v("periodic","Periodic Notes daily settings could not be read safely."))}}}catch{n.push(new v("periodic","Periodic Notes provider shape is unavailable or unsupported."))}return{candidates:t,errors:n}}function le(e,t,n,i,r=[]){let o=[];for(let s of t)try{let l=Me(e,s.settings,n,void 0,i);o.push({...s,targetDate:l})}catch{}if(!o.length){let s=r.length?` ${r.map(l=>l.message).join(" ")}`:"";throw new M(`The active note does not match configured Daily Notes or Periodic Notes settings.${s} Open a configured Daily Note or check those settings.`)}if(new Set(o.map(s=>s.targetDate)).size>1)throw new M("The active note matches multiple Daily Notes configurations with different dates; import is ambiguous.");return o.find(s=>s.kind==="core")??o[0]}function Ve(e,t){if(e.kind!==t.kind||e.targetDate!==t.targetDate||(e.settings.folder??"")!==(t.settings.folder??"")||(e.settings.format??"")!==(t.settings.format??"")||(e.settings.template??"")!==(t.settings.template??""))throw new g("The Daily Note provider or configuration changed; import aborted before writing.")}var x=class extends Error{constructor(t){super(t),this.name="CalendarInsertionError"}};function de(e){return e.includes(`\r
`)?`\r
`:`
`}function Tt(e,t){return ie(e).filter(n=>n.text===t).map(n=>n.start)}function Mt(e,t,n,i){let r=ie(e).find(p=>p.start===t&&p.text===n);if(!r)throw new x("The configured insertion heading could not be located.");let o=de(e),a=e.startsWith(`\r
`,r.contentEnd)?2:e[r.contentEnd]===`
`?1:0,s=a>0,l=o,c=s?o:"";return`${e.slice(0,r.contentEnd)}${l}${i}${c}${e.slice(r.contentEnd+a)}`}function ce(e,t,n){ne(t);let r=L(e)?te(e):e,o=Tt(r,n);if(o.length===0)throw new x(`The insertion heading ${n} was not found exactly once; import aborted without changing the note.`);if(o.length>1)throw new x(`The insertion heading ${n} must appear exactly once; it appears ${o.length} times, so import aborted without changing the note.`);return Mt(r,o[0],n,t)}function $t(e,t){return t?e<=t.start?e:e>=t.end?e-(t.end-t.start):t.start:Math.max(0,e)}function Le(e,t,n){if(ne(t),!Number.isSafeInteger(n)||n<0||n>e.length)throw new x("The active editor cursor is unavailable; import aborted without changing the note.");let i=L(e),r=$t(n,i),o=i?te(e):e,a=r>0&&o[r-1]!==`
`,s=r<o.length&&o[r]!==`
`,l=a?de(o):"",c=s?de(o):"";return{content:`${o.slice(0,r)}${l}${t}${c}${o.slice(r)}`,insertionOffset:r,oldRange:i}}var _=class extends d.Plugin{constructor(){super(...arguments);this.settings={...w};this.excludedVaultFoldersPersistedInvalid=!1}async onload(){await this.loadSettings(),this.addCommand({id:"import-calendar-events-into-active-daily-note",name:"Import Calendar events into active Daily Note",callback:()=>{this.importIntoActiveDailyNote()}}),this.addSettingTab(new ue(this.app,this))}async loadSettings(){let n=await this.loadData(),i=Te(n);this.excludedVaultFoldersPersistedInvalid=i.excludedVaultFolders.malformed,this.excludedVaultFoldersInput=i.excludedVaultFolders.rawInput,this.settings={excludedVaultFolders:i.excludedVaultFolders.folders,insertionMode:i.insertionMode,insertionHeading:i.insertionHeading,eventHeadingLevel:i.eventHeadingLevel,timeFormat:i.timeFormat,linkMatchingVaultNotes:i.linkMatchingVaultNotes,linkEventTitles:i.linkEventTitles}}async saveSettings(){let n=Ee(this.settings.excludedVaultFolders),i=Y(this.settings.insertionHeading);if(!i)throw new Error("Insertion heading must be a Markdown heading from # to ######, such as # Notes.");let r=B(this.settings.insertionMode);if(!r)throw new Error("Insert Calendar events must be set to Below a heading or At the cursor.");let o=z(this.settings.eventHeadingLevel);if(!o)throw new Error("Event heading level must be Heading 2 through Heading 6.");let a=O(this.settings.timeFormat);if(!a)throw new Error("Time format must be 24-hour or 12-hour.");if(typeof this.settings.linkMatchingVaultNotes!="boolean"||typeof this.settings.linkEventTitles!="boolean")throw new Error("Linking settings must be enabled or disabled.");this.settings={excludedVaultFolders:n,insertionMode:r,insertionHeading:i,eventHeadingLevel:o,timeFormat:a,linkMatchingVaultNotes:F(this.settings.linkMatchingVaultNotes,w.linkMatchingVaultNotes),linkEventTitles:F(this.settings.linkEventTitles,w.linkEventTitles)};let s=this.excludedVaultFoldersPersistedInvalid?{...this.settings,excludedVaultFolders:this.excludedVaultFoldersInput??""}:this.settings;await this.saveData(s)}activeMarkdownEditor(n){let i=this.app.workspace.getActiveViewOfType(d.MarkdownView);return!i?.editor||!i.file||i.file.path!==n.path?null:i.editor}replaceEditorContent(n,i,r){if(i===r)return;let o=0;for(;o<i.length&&o<r.length&&i[o]===r[o];)o+=1;let a=0;for(;a<i.length-o&&a<r.length-o&&i[i.length-a-1]===r[r.length-a-1];)a+=1;let s=n.offsetToPos(o),l=n.offsetToPos(i.length-a);n.replaceRange(r.slice(o,r.length-a),s,l,"calendar-daily-note-linker")}async importIntoActiveDailyNote(){let n=new d.Notice("Checking the active Daily Note\u2026",0),i=r=>{n.setMessage(r),window.setTimeout(()=>n.hide(),1e4)};try{if(process.platform!=="darwin")throw new Error("Calendar Daily Note Linker requires macOS desktop and Calendar access.");let r=this.app.workspace.getActiveFile();if(!r||r.extension.toLowerCase()!=="md")throw new g("Open an existing configured Daily Note before running this command.");if(this.settings.linkMatchingVaultNotes&&this.excludedVaultFoldersPersistedInvalid)throw new Error("Saved vault folder exclusions are invalid. Correct them in settings before importing Calendar events.");let o=(f,h)=>(0,d.moment)(f,h,!0),a=f=>(0,d.moment)(f,"YYYY-MM-DD",!0),s=se(this.app),l=le(r,s.candidates,o,a,s.errors),c=l.targetDate;n.setMessage(`Reading Calendar for ${c}\u2026`);let p=await ve(c);p.warnings.length&&new d.Notice(`Calendar warning: ${p.warnings.join(" ")}`,8e3);let m=we(this.settings.linkMatchingVaultNotes,()=>{n.setMessage("Matching vault notes\u2026");let f=this.app.vault.getMarkdownFiles().map(h=>({path:h.path,basename:h.basename,file:h,frontmatter:this.app.metadataCache.getFileCache(h)?.frontmatter}));return De(ke(f,this.settings.excludedVaultFolders),h=>{if(!h.file)throw new Error(`Vault note is unavailable: ${h.path}`);return this.app.fileManager.generateMarkdownLink(h.file,r.path,void 0,h.basename||void 0)})});this.settings.linkMatchingVaultNotes||n.setMessage("Skipping vault note matching\u2026");let D=Ne(p,m,this.settings);n.setMessage("Writing the active Daily Note\u2026");let U=this.app.workspace.getActiveFile();if(!U||this.app.vault.getAbstractFileByPath(r.path)!==r)throw new g("The active Daily Note changed, moved, or was deleted; import aborted before writing.");let ge=se(this.app),j=le(U,ge.candidates,o,a,ge.errors);Fe(r,U,l.settings,j.settings,c,j.targetDate),Ve(l,j);let b=this.activeMarkdownEditor(r);if(this.settings.insertionMode==="cursor"){if(!b)throw new g("At the cursor requires the active Daily Note's Markdown editor and a usable cursor; import aborted without changing the note.");let f=b.getValue(),h=b.getCursor(),Se=b.posToOffset(h),Re=Le(f,D.block,Se);this.replaceEditorContent(b,f,Re.content)}else if(b){let f=b.getValue(),h=ce(f,D.block,this.settings.insertionHeading);this.replaceEditorContent(b,f,h)}else await this.app.vault.process(r,f=>ce(f,D.block,this.settings.insertionHeading));i(Ae(c,r.basename,D.eventCount,D.linkCount,this.settings))}catch(r){let o=r instanceof y||r instanceof M||r instanceof g||r instanceof x?r.message:`Could not import Calendar events: ${r instanceof Error?r.message:String(r)}`;i(o)}}},ue=class extends d.PluginSettingTab{constructor(t,n){super(t,n),this.plugin=n}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Calendar Daily Note Linker"}),this.plugin.excludedVaultFoldersPersistedInvalid&&t.createEl("p",{text:"Saved vault folder exclusions are invalid; correct them before importing Calendar events."}),t.createEl("h3",{text:"Insertion"}),new d.Setting(t).setName("Insert Calendar events").setDesc("Choose where the managed Calendar block is placed in the active Daily Note.").addDropdown(n=>{n.addOption("heading","Below a heading").addOption("cursor","At the cursor").setValue(this.plugin.settings.insertionMode).onChange(i=>{this.commitInsertionMode(n,i)})}),this.plugin.settings.insertionMode==="heading"&&new d.Setting(t).setName("Insertion heading").setDesc("The managed block appears immediately below this exact standalone Markdown heading; outer incidental whitespace is trimmed, internal whitespace is preserved, and the field saves on blur. Older sectionHeading content is not used as the destination.").addText(n=>{n.setPlaceholder(w.insertionHeading).setValue(this.plugin.settings.insertionHeading),n.inputEl.addEventListener("blur",()=>{this.commitInsertionHeading(n)})}),t.createEl("h3",{text:"Formatting"}),new d.Setting(t).setName("Event heading level").setDesc("Each event title is rendered as a Markdown heading.").addDropdown(n=>{for(let i of[2,3,4,5,6])n.addOption(String(i),`Heading ${i}`);n.setValue(String(this.plugin.settings.eventHeadingLevel)).onChange(i=>{this.commitEventHeadingLevel(n,i)})}),new d.Setting(t).setName("Time format").setDesc("Timed events use the Calendar event's local timezone.").addDropdown(n=>{n.addOption("24-hour","24-hour \u2014 09:00 \u2013 09:30").addOption("12-hour","12-hour \u2014 9:00 AM \u2013 9:30 AM").setValue(this.plugin.settings.timeFormat).onChange(i=>{this.commitTimeFormat(n,i)})}),new d.Setting(t).setName("Link matching vault notes").setDesc("Add deterministic links for uniquely matching attendees or event titles.").addToggle(n=>{n.setValue(this.plugin.settings.linkMatchingVaultNotes).onChange(i=>{this.commitBoolean(n,"linkMatchingVaultNotes",i)})}),new d.Setting(t).setName("Link event titles to Calendar").setDesc("Use a Calendar event URL as a Markdown link on the event title when available.").addToggle(n=>{n.setValue(this.plugin.settings.linkEventTitles).onChange(i=>{this.commitBoolean(n,"linkEventTitles",i)})}),t.createEl("h3",{text:"Vault matching"}),new d.Setting(t).setName("Vault folders to exclude").setDesc("Optional vault-relative folders to skip when matching Calendar attendees; one path per line; exclusions include subfolders; blank searches all Markdown notes.").addTextArea(n=>{n.setPlaceholder(`Archive
Templates
Private/People`).setValue(this.plugin.excludedVaultFoldersInput??this.plugin.settings.excludedVaultFolders.join(`
`)),n.inputEl.addEventListener("blur",()=>{this.commitExcludedVaultFolders(n)})}),t.createEl("p",{text:"Open an existing configured Daily Note, then run the command; it updates that open note for its date and relocates its one managed Calendar block."})}async commitInsertionMode(t,n){let i=this.plugin.settings.insertionMode,r=B(n);if(!r){t.setValue(i),new d.Notice("Choose Below a heading or At the cursor.");return}this.plugin.settings.insertionMode=r;try{await this.plugin.saveSettings(),this.display()}catch(o){this.plugin.settings.insertionMode=i,t.setValue(i),new d.Notice(`Could not save insertion mode: ${o instanceof Error?o.message:String(o)}`)}}async commitInsertionHeading(t){let n=this.plugin.settings.insertionHeading,i=Y(t.getValue());if(!i){t.setValue(n),new d.Notice("Use an exact Markdown heading from # to ######, such as # Notes.");return}this.plugin.settings.insertionHeading=i,t.setValue(i);try{await this.plugin.saveSettings()}catch(r){this.plugin.settings.insertionHeading=n,t.setValue(n),new d.Notice(`Could not save the Insertion heading: ${r instanceof Error?r.message:String(r)}`)}}async commitEventHeadingLevel(t,n){let i=this.plugin.settings.eventHeadingLevel,r=z(n);if(!r){t.setValue(String(i)),new d.Notice("Choose an event heading level from Heading 2 through Heading 6.");return}this.plugin.settings.eventHeadingLevel=r;try{await this.plugin.saveSettings()}catch(o){this.plugin.settings.eventHeadingLevel=i,t.setValue(String(i)),new d.Notice(`Could not save the Event heading level: ${o instanceof Error?o.message:String(o)}`)}}async commitTimeFormat(t,n){let i=this.plugin.settings.timeFormat,r=O(n);if(!r){t.setValue(i),new d.Notice("Choose 24-hour or 12-hour time format.");return}this.plugin.settings.timeFormat=r;try{await this.plugin.saveSettings()}catch(o){this.plugin.settings.timeFormat=i,t.setValue(i),new d.Notice(`Could not save the Time format: ${o instanceof Error?o.message:String(o)}`)}}async commitBoolean(t,n,i){let r=this.plugin.settings[n];this.plugin.settings[n]=i;try{await this.plugin.saveSettings()}catch(o){this.plugin.settings[n]=r,t.setValue(r),new d.Notice(`Could not save linking setting: ${o instanceof Error?o.message:String(o)}`)}}async commitExcludedVaultFolders(t){let n=[...this.plugin.settings.excludedVaultFolders],i=this.plugin.excludedVaultFoldersPersistedInvalid,r=this.plugin.excludedVaultFoldersInput,o=H(t.getValue());if(!o){this.plugin.excludedVaultFoldersPersistedInvalid||t.setValue(n.join(`
`)),new d.Notice("Use one safe vault-relative folder per line, or leave the field blank.");return}this.plugin.settings.excludedVaultFolders=o,this.plugin.excludedVaultFoldersPersistedInvalid=!1,this.plugin.excludedVaultFoldersInput=void 0,t.setValue(o.join(`
`));try{await this.plugin.saveSettings()}catch(a){this.plugin.settings.excludedVaultFolders=n,this.plugin.excludedVaultFoldersPersistedInvalid=i,this.plugin.excludedVaultFoldersInput=r,t.setValue(i?r??"":n.join(`
`)),new d.Notice(`Could not save excluded folders: ${a instanceof Error?a.message:String(a)}`)}}};
