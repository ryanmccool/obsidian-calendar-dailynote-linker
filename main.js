"use strict";var j=Object.defineProperty;var Ue=Object.getOwnPropertyDescriptor;var We=Object.getOwnPropertyNames;var je=Object.prototype.hasOwnProperty;var Ke=(e,t)=>{for(var n in t)j(e,n,{get:t[n],enumerable:!0})},Ge=(e,t,n,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of We(t))!je.call(e,r)&&r!==n&&j(e,r,{get:()=>t[r],enumerable:!(i=Ue(t,r))||i.enumerable});return e};var Ze=e=>Ge(j({},"__esModule",{value:!0}),e);var Wt={};Ke(Wt,{default:()=>_});module.exports=Ze(Wt);var c=require("obsidian");var he=require("node:child_process"),we=require("node:util");var g=class extends Error{constructor(t){super(t),this.name="CalendarPayloadValidationError"}};function $(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function C(e,t){if(typeof e!="string")throw new g(`${t} must be a string`);return e}function P(e,t){if(e!==null&&typeof e!="string")throw new g(`${t} must be a string or null`);return e}function F(e,t){let n=C(e,t);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(n)||Number.isNaN(Date.parse(n)))throw new g(`${t} must be a valid ISO date`);return n}function K(e){let t=C(e,"targetDate");if(!/^\d{4}-\d{2}-\d{2}$/.test(t))throw new g("targetDate must be YYYY-MM-DD");let[n,i,r]=t.split("-").map(Number),a=new Date(Date.UTC(n,i-1,r));if(a.getUTCFullYear()!==n||a.getUTCMonth()!==i-1||a.getUTCDate()!==r)throw new g("targetDate must be a valid calendar date");return t}function qe(e){return/^(?:EventKit|Some EventKit) (?:calendar|event URL|event title|attendee|attendee display name|attendee email|attendee status) data is unavailable on this macOS\/source\.$/.test(e)}var Je=new Set(["unknown","pending","accepted","declined","tentative","delegated","completed","in-process"]);function Qe(e,t){let n=C(e,`attendee ${t} status`);if(!Je.has(n))throw new g(`attendee ${t} status is not a stable EventKit status`);return n}function Xe(e,t){if(!$(e))throw new g(`events attendee ${t} must be an object`);return{displayName:P(e.displayName,`attendee ${t} displayName`),email:P(e.email,`attendee ${t} email`),status:Qe(e.status,t)}}function et(e,t){if(!$(e))throw new g(`event ${t} must be an object`);let n=e.attendees;if(!Array.isArray(n))throw new g(`event ${t} attendees must be an array`);let i=F(e.start,`event ${t} start`),r=F(e.end,`event ${t} end`);if(Date.parse(r)<Date.parse(i))throw new g(`event ${t} end cannot precede start`);if(typeof e.allDay!="boolean")throw new g(`event ${t} allDay must be a boolean`);return{id:P(e.id,`event ${t} id`),calendar:P(e.calendar,`event ${t} calendar`),title:C(e.title,`event ${t} title`),start:i,end:r,allDay:e.allDay,url:P(e.url,`event ${t} url`),location:P(e.location,`event ${t} location`),notes:e.notes===null?null:(()=>{throw new g(`event ${t} notes must be null`)})(),attendees:n.map((a,o)=>Xe(a,o))}}function pe(e){let t;try{t=JSON.parse(e)}catch{throw new g("Calendar bridge output was not valid JSON")}return tt(t)}function tt(e){if(!$(e))throw new g("Calendar bridge output must be a JSON object");if(e.schemaVersion!==1)throw new g("Calendar bridge output has an unsupported schema version");if(!$(e.range))throw new g("Calendar bridge output range must be an object");let t=F(e.range.start,"range start"),n=F(e.range.end,"range end");if(Date.parse(n)<=Date.parse(t))throw new g("range end must be after range start");let i=C(e.range.timeZone,"range timeZone").trim();if(!i)throw new g("range timeZone cannot be empty");if(!Array.isArray(e.events))throw new g("Calendar bridge output events must be an array");if(!Array.isArray(e.warnings)||e.warnings.some(a=>typeof a!="string"))throw new g("Calendar bridge output warnings must be an array of strings");let r=e.warnings;return{schemaVersion:1,source:C(e.source,"source"),targetDate:K(e.targetDate),range:{start:t,end:n,timeZone:i},events:e.events.map((a,o)=>et(a,o)),warnings:r.map(a=>{if(!qe(a))throw new g("Calendar bridge warnings may only describe unavailable optional EventKit data");return a})}}var fe=`/*
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
`;var nt=(0,we.promisify)(he.execFile),rt=async(e,t,n)=>await nt(e,t,n),k=class extends Error{constructor(t,n=!1){super(t),this.name="CalendarBridgeError",this.isPermissionFailure=n}},it=/\bEVENTKIT_PERMISSION_(?:DENIED|RESTRICTED|WRITE_ONLY|REQUEST_TIMEOUT|UNAVAILABLE)\b/;function A(e){return typeof e!="string"?"":e.replace(/[\u0000-\u001f\u007f-\u009f]/gu," ").replace(/\s+/gu," ").trim().slice(0,500)}function q(e){return(typeof e=="string"?e.match(it):null)?.[0]??null}function G(e){return`EventKit Calendar permission failed (${e}). Allow Calendar access in System Settings \u2192 Privacy & Security \u2192 Calendars, then try again.`}function Z(e){return`EventKit bridge failed: ${e||"no diagnostic details were returned."}`}function at(e){let t=e,n=A(t?.stderr),i=A(t?.message);return{details:n||i,code:q(`${n} ${i}`)}}async function ve(e,t=rt){try{K(e)}catch(r){throw new k(r instanceof Error?r.message:"Calendar target date must be YYYY-MM-DD.")}let n;try{n=await t("/usr/bin/osascript",["-l","JavaScript","-e",fe,e],{encoding:"utf8",timeout:3e4,maxBuffer:2*1024*1024,shell:!1,windowsHide:!0})}catch(r){let a=at(r);throw a.code?new k(G(a.code),!0):new k(Z(a.details))}let i=n.stdout.trim();if(!i){let r=A(n.stderr),a=q(n.stderr);throw a?new k(G(a),!0):new k(Z(r))}try{let r=pe(i);if(r.targetDate!==e)throw new Error(`Calendar bridge returned ${r.targetDate} instead of ${e}.`);return r}catch(r){let a=A(r instanceof Error?r.message:String(r)),o=A(n.stderr),s=q(`${o} ${a}`);throw s?new k(G(s),!0):new k(Z([o,a].filter(Boolean).join(" | ")))}}function ot(){return{byEmail:new Map,byName:new Map}}function ye(e,t){return e?t():ot()}function J(e,t,n){if(!t)return;let i=e.get(t)??[];i.some(r=>r.path===n.path)||(i.push(n),i.sort((r,a)=>r.path.localeCompare(a.path))),e.set(t,i)}function I(e){return e.normalize("NFKC").toLowerCase().replaceAll("\u03C2","\u03C3")}function N(e){return I(e).trim().replace(/\s+/gu," ")}function ke(e){return I(e).trim().replace(/\s+/gu,"")}function Q(e,t){let n=e?.[t];return typeof n=="string"?[n]:Array.isArray(n)?n.filter(i=>typeof i=="string"):[]}function st(e){let t=e.path.replaceAll("\\","/"),n=e.basename||t.split("/").at(-1)?.replace(/\.md$/i,"")||"";return{path:t,basename:n,file:e.file}}function lt(e,t){let n=e.replaceAll("\\","/");return t.some(i=>{let r=i.replaceAll("\\","/").replace(/\/+$/u,"");return n===r||n.startsWith(`${r}/`)})}function be(e,t){let n=new Map,i=new Map;for(let r of e){let a=r.path.replaceAll("\\","/");if(!a.toLowerCase().endsWith(".md")||lt(a,t))continue;let o=st(r);J(i,N(o.basename),o);for(let s of Q(r.frontmatter,"aliases"))J(i,N(s),o);for(let s of[...Q(r.frontmatter,"email"),...Q(r.frontmatter,"emails")])J(n,ke(s),o)}return{byEmail:n,byName:i}}function xe(e,t){let n=t.email?ke(t.email):"";if(n){let a=e.byEmail.get(n);if(a?.length===1)return a[0];if(a&&a.length>1)return null}let i=t.displayName?N(t.displayName):"";if(!i)return null;let r=e.byName.get(i);return r?.length===1?r[0]:null}function De(e,t){let n=new Map,i=(a,o)=>{if(!o||typeof o.linkText!="string")throw new Error(`Vault note link data is invalid for ${a.path}.`);if(!o.linkText.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(o.linkText)||o.linkText.includes("<!-- calendar-daily-note-linker:start -->")||o.linkText.includes("<!-- calendar-daily-note-linker:end -->"))throw new Error(`Vault note link data is unsafe for ${a.path}.`);return{linkText:o.linkText}},r=a=>a.map(o=>{let s=n.get(o.path);return s===void 0&&(s=i(o,t(o)),n.set(o.path,s)),{...o,...s}});return{byEmail:new Map([...e.byEmail].map(([a,o])=>[a,r(o)])),byName:new Map([...e.byName].map(([a,o])=>[a,r(o)]))}}var T="<!-- calendar-daily-note-linker:start -->",E="<!-- calendar-daily-note-linker:end -->",M=class extends Error{constructor(t){super(t),this.name="CalendarBlockError"}};function X(e){return[T,...e.map(Pe),E].join(`
`)}function V(e){let t=dt(e),n=[],i=[];for(let r of t){let a=r.content===T,o=r.content===E;if(a&&n.push(r),o&&i.push(r),(r.content.includes(T)||r.content.includes(E))&&!a&&!o)throw new M("The Calendar section marker must be on an exact standalone line.")}if(n.length===0&&i.length===0)return null;if(n.length!==1||i.length!==1||n[0].start>=i[0].start)throw new M("The Calendar section markers are duplicated, incomplete, or out of order.");return{start:n[0].start,end:i[0].next}}function ee(e){let t=V(e);return t?`${e.slice(0,t.start)}${e.slice(t.end)}`:e}function te(e){let t=e.split(`
`).map(n=>n.endsWith("\r")?n.slice(0,-1):n);if(t[0]!==T||t[t.length-1]!==E)throw new M("Generated Calendar content has invalid section markers.");if(t.slice(1,-1).some(n=>n.includes(T)||n.includes(E)))throw new M("Generated Calendar content contains a section marker literal.")}function Pe(e){return e.replace(/\r\n?|\n|\u2028|\u2029/gu," ").replace(/[\u0000-\u001f\u007f-\u009f]/gu,"").replaceAll(T,"[calendar section start]").replaceAll(E,"[calendar section end]")}function ne(e){return Pe(e).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replace(/[\\`*_{}\[\]()#+\-.!|>~]/gu,"\\$&")}function dt(e){let t=e.split(`
`),n=[],i=0;for(let r of t){let a=r.endsWith("\r")?r.slice(0,-1):r,o=i+r.length;n.push({raw:r,content:a,start:i,end:o,next:Math.min(e.length,o+1)}),i=o+1}return n}var ct={eventHeadingLevel:2,timeFormat:"24-hour",linkMatchingVaultNotes:!0,linkEventTitles:!0};function Ce(e){return e.replaceAll("\\","\\\\").replace(/[\s<>]/gu,t=>encodeURIComponent(t)).replaceAll("(","\\(").replaceAll(")","\\)").replaceAll('"',"%22")}function Me(e){if(!e?.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(e)||e.includes("<!-- calendar-daily-note-linker:start -->")||e.includes("<!-- calendar-daily-note-linker:end -->"))return null;try{let t=new URL(e.trim());return t.protocol==="http:"||t.protocol==="https:"?t.href:null}catch{return null}}function Se(e,t){if(e.allDay!==t.allDay)return e.allDay?-1:1;let n=Date.parse(e.start)-Date.parse(t.start);if(n!==0)return n;let i=Date.parse(e.end)-Date.parse(t.end);return i!==0?i:e.title.localeCompare(t.title)}function R(e,t,n="24-hour"){let i={timeZone:t,hour:"numeric",minute:"2-digit",hour12:n==="12-hour",...n==="24-hour"?{hourCycle:"h23"}:{}};try{return new Intl.DateTimeFormat("en-US",i).format(new Date(e))}catch{return new Intl.DateTimeFormat("en-US",{...i,timeZone:void 0}).format(new Date(e))}}function ut(e){return ne(e).replaceAll("\\-","-")}function gt(e){let t=Intl.Segmenter;if(t)return[...new t(void 0,{granularity:"grapheme"}).segment(e)];let n=[],i=0;for(let r of e){let a=i;i+=r.length;let o=r;for(;i<e.length;){let s=e.codePointAt(i);if(s===void 0)break;let l=String.fromCodePoint(s);if(!/[\p{M}\u200d\ufe0e\ufe0f]/u.test(l)&&!o.endsWith("\u200D"))break;o+=l,i+=l.length}n.push({index:a,segment:o})}return n}function mt(e){let t=[],n=[],i=[],r,a,o=(s,l,d)=>{t.push(s);for(let u=0;u<s.length;u+=1)n.push(l),i.push(d)};for(let s of gt(e)){let l=I(s.segment),d=s.index+s.segment.length;if(/^\s+$/u.test(l)){r??(r=s.index),a=d;continue}t.length>0&&r!==void 0&&a!==void 0&&o(" ",r,a),r=void 0,a=void 0,o(l,s.index,d)}return{value:t.join(""),starts:n,ends:i}}function Ne(e){return e!==void 0&&/[\p{L}\p{N}\p{M}_]/u.test(e)}function pt(e,t){if(t<=0)return;let n=t-1,i=e.charCodeAt(n);i>=56320&&i<=57343&&n>0&&(n-=1);let r=e.codePointAt(n);return r===void 0?void 0:String.fromCodePoint(r)}function ft(e,t){let n=e.codePointAt(t);return n===void 0?void 0:String.fromCodePoint(n)}var ht=new Set(["a","an","and","at","by","dr","for","from","in","mr","mrs","ms","of","on","or","prof","the","to","with"]);function Te(e){let t=e?N(e):"";if(!t||t.includes(","))return null;let n=t.match(/[\p{L}\p{N}\p{M}]+(?:['-][\p{L}\p{N}\p{M}]+)*/u)?.[0]??"";return!n||[...n].length<2||/^\p{N}+$/u.test(n)||ht.has(n)?null:n}function Ee(e,t){let n=t?N(t):"";n&&!e.fullNames.includes(n)&&e.fullNames.push(n)}function wt(e,t){let n=new Map;for(let r of t){let a=xe(e,r);if(!a||!a.linkText)continue;let o=n.get(a.path)??{target:a,fullNames:[],shortName:null};Ee(o,r.displayName),Ee(o,o.target.basename),o.shortName??(o.shortName=Te(r.displayName)??Te(o.target.basename)),n.set(a.path,o)}let i=new Map;for(let r of n.values()){let a=r.shortName?[...r.fullNames,r.shortName]:r.fullNames;for(let o of a){let s=i.get(o)??new Set;s.add(r.target.path),i.set(o,s)}}return[...n.values()].map(r=>{let a=r.fullNames.filter(o=>i.get(o)?.size===1);return r.shortName&&i.get(r.shortName)?.size===1&&!a.includes(r.shortName)&&a.push(r.shortName),{target:r.target,names:a}})}function vt(e,t){if(!t.some(a=>a.names.length>0&&!!a.target.linkText))return[];let n=mt(e),i=[];for(let a of t)if(a.target.linkText)for(let o of a.names){let s=0;for(;s<n.value.length;){let l=n.value.indexOf(o,s);if(l<0)break;let d=l+o.length;if(!Ne(pt(n.value,l))&&!Ne(ft(n.value,d))){let u=n.starts[l],f=n.ends[l];for(let h=l+1;h<d;h+=1)u=Math.min(u,n.starts[h]),f=Math.max(f,n.ends[h]);i.push({start:u,end:f,normalizedLength:o.length,target:a.target})}s=l+1}}i.sort((a,o)=>a.normalizedLength!==o.normalizedLength?o.normalizedLength-a.normalizedLength:a.start!==o.start?a.start-o.start:o.end-a.end);let r=[];for(let a of i)r.some(o=>a.start<o.end&&o.start<a.end)||r.push(a);return r.sort((a,o)=>a.start-o.start)}function yt(e){return e.replaceAll("<!-- calendar-daily-note-linker:start -->","[calendar section start]").replaceAll("<!-- calendar-daily-note-linker:end -->","[calendar section end]").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu,"").replaceAll("\\","\\\\").replaceAll("|","\\|").replaceAll("]","\\]")}function kt(e,t,n){return e.linkText?`[[${yt(e.linkText)}|${n(t)}]]`:null}function bt(e,t,n){let i=vt(e,t),r="",a=0,o=0;for(let s of i){let l=kt(s.target,e.slice(s.start,s.end),n);l&&(r+=n(e.slice(a,s.start)),r+=l,a=s.end,o+=1)}return r+=n(e.slice(a)),{title:r,linkCount:o}}function Ae(e,t,n,i){return n?bt(e.title,wt(t,e.attendees),i):{title:i(e.title),linkCount:0}}function Le(e,t){if(!t)return e.title;let n=`[Calendar](${Ce(t)})`;return e.linkCount>0?`${e.title} \xB7 ${n}`:`[${e.title}](${Ce(t)})`}function xt(e,t,n,i){let r=i.linkEventTitles?Me(e.url):null,a=Ae(e,n,i.linkMatchingVaultNotes,ut),o=Le(a,r),s=`${"#".repeat(i.eventHeadingLevel)} ${o}`,l=e.allDay?"All day":`${R(e.start,t.range.timeZone,i.timeFormat)} \u2013 ${R(e.end,t.range.timeZone,i.timeFormat)}`;return{lines:[s,l],linkCount:a.linkCount}}function Dt(e,t,n){let i=[],r=[...e.events].sort(Se),a=0;if(!r.length)i.push(`No Calendar events found for ${e.targetDate}.`);else for(let o of r){let s=xt(o,e,t,n);i.push(...s.lines),a+=s.linkCount}return{block:X(i),eventCount:r.length,linkCount:a}}function Pt(e,t,n){let i=[t],r=[...e.events].sort(Se),a=0;if(!r.length)i.push(`No Calendar events found for ${e.targetDate}.`);else for(let o of r){let s=Me(o.url),l=Ae(o,n,!0,ne),d=Le(l,s),u=o.allDay?"All day":`${R(o.start,e.range.timeZone,"12-hour")}\u2013${R(o.end,e.range.timeZone,"12-hour")}`;i.push(d),i.push(u),a+=l.linkCount}return{block:X(i),eventCount:r.length,linkCount:a}}function $e(e,t,n){return typeof t=="string"?Pt(e,t,n):Dt(e,t,{...ct,...n})}function Ct(e){return/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(e)}function re(e){return!e||/[\r\n\u2028\u2029]/u.test(e)||Ct(e)?!1:/^#{1,6}[ \t]+\S(?:.*)$/u.test(e.trim())}function Nt(e){let t=/^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(e);if(!t)return null;let n=t[2];return{character:n[0],length:n.length}}function Tt(e,t){return new RegExp(`^ {0,3}${t.character}{${t.length},}[ \\t]*$`,"u").test(e)}function ie(e){let t=e.split(`
`),n=[],i=0,r=t.length>0&&t[0].replace(/^\ufeff/u,"").trim()==="---",a=null;for(let o of t){let s=o.endsWith("\r")?o.slice(0,-1):o,l=i+s.length;if(r){i!==0&&(s.trim()==="---"||s.trim()==="...")&&(r=!1),i+=o.length+1;continue}if(a){Tt(s,a)&&(a=null),i+=o.length+1;continue}let d=Nt(s);if(d){let f=s.replace(/^ {0,3}(`{3,}|~{3,})/u,"");(d.character==="~"||!f.includes("`"))&&(a=d),i+=o.length+1;continue}if(/^(?: {4}|\t)/u.test(s)){i+=o.length+1;continue}let u=s.trim();re(u)&&n.push({text:u,start:i,contentEnd:l}),i+=o.length+1}return n}var y={excludedVaultFolders:[],insertionMode:"heading",insertionHeading:"# Notes",eventHeadingLevel:2,timeFormat:"24-hour",linkMatchingVaultNotes:!0,linkEventTitles:!0},ae=class extends Error{constructor(){super("Vault folder exclusions are malformed. Correct them in settings before importing Calendar events."),this.name="ExcludedVaultFolderError"}};function Et(e){let t=e.replaceAll("\\","/"),n=t.split("/");if(!(!t||t.startsWith("/")||/^[A-Za-z]:/.test(t)||n.some(i=>i.length===0||i==="."||i===".."||i.includes("\0"))))return t}function H(e){let t=Array.isArray(e),n=typeof e=="string"?e.split(/\r\n?|\n|\u2028|\u2029/gu):t&&e.every(r=>typeof r=="string")?e:void 0;if(!n)return;let i=[];for(let r of n){if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(r))return;if(!r.trim())continue;let a=Et(r);if(!a)return;i.includes(a)||i.push(a)}return i}function Fe(e){if(e===void 0)return y.excludedVaultFolders;let t=H(e);if(!t)throw new ae;return t}function Mt(e){if(e===void 0)return{folders:[],malformed:!1};let t=H(e);return t?{folders:t,malformed:!1}:{folders:[],malformed:!0,rawInput:typeof e=="string"?e:Array.isArray(e)?e.map(String).join(`
`):String(e)}}function z(e){if(typeof e!="string"||/[\r\n\u2028\u2029]/u.test(e)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(e))return;let t=e.trim();if(!(!re(t)||t.includes("<!--")||t.includes("-->")||t.includes("\0")))return t}function St(e){return z(e)??y.insertionHeading}function Y(e){return e==="heading"||e==="cursor"?e:void 0}function At(e){return Y(e)??y.insertionMode}function B(e){let t=typeof e=="string"&&/^\d+$/u.test(e)?Number(e):e;return t===2||t===3||t===4||t===5||t===6?t:void 0}function Lt(e){return B(e)??y.eventHeadingLevel}function O(e){return e==="24-hour"||e==="12-hour"?e:void 0}function $t(e){return O(e)??y.timeFormat}function L(e,t){return typeof e=="boolean"?e:t}function Ie(e){let t=typeof e=="object"&&e!==null&&!Array.isArray(e)?e:{},n=t.insertionHeading;return{excludedVaultFolders:Mt(t.excludedVaultFolders),insertionMode:At(t.insertionMode),insertionHeading:St(n),eventHeadingLevel:Lt(t.eventHeadingLevel),timeFormat:$t(t.timeFormat),linkMatchingVaultNotes:L(t.linkMatchingVaultNotes,y.linkMatchingVaultNotes),linkEventTitles:L(t.linkEventTitles,y.linkEventTitles)}}var m=class extends Error{constructor(t){super(t),this.name="ActiveDailyNoteError"}};function Ft(e){return(e??"").replaceAll("\\","/").replace(/\/+$/u,"")}function It(e){let t=[],n=0;for(;n<e.length;){if(e[n]==="\\"){n+=2;continue}if(e[n]==="["){let i=e.indexOf("]",n+1);n=i===-1?e.length:i+1;continue}if(/[YMD]/u.test(e[n])){let i=n,r=e[n];for(;n<e.length&&e[n]===r&&n-i<5;)n+=1;t.push({token:e.slice(i,n),start:i,end:n});continue}n+=1}return t}function Vt(e){if(typeof e!="string"||!e)return!1;let t=It(e),n=t.filter(({token:s})=>s.startsWith("D")),i=n.some(({token:s})=>s.length>=3),r=n.some(({token:s})=>s.length<=2),a=t.some(({token:s})=>s.startsWith("M"));return!t.some(({token:s})=>s.startsWith("Y"))||!(i||a&&r)?!1:t.some(({token:s})=>s==="YYYY")}function Rt(e,t){let n=e.replaceAll("\\","/"),i=t?`${t}/`:"";if(t&&!n.startsWith(i))throw new m("The active note is outside the configured core Daily Notes folder.");let r=n.slice(i.length);if(!r.endsWith(".md"))throw new m("The active note must be a Markdown Daily Note.");return r.slice(0,-3)}function Ve(e,t,n,i,r){if(e.extension.toLowerCase()!=="md")throw new m("Open an existing configured Daily Note before running this command.");if(!Vt(t.format))throw new m("The core Daily Notes filename format cannot identify one calendar date.");let a=Ft(t.folder),o=t.format,s=Rt(e.path,a),l=n(s,o,!0);if(!l?.isValid()||l.format(o)!==s){if(!r)throw new m("The active note path is not the canonical core Daily Note for one date.");let f=n(s,o,!1);if(!f?.isValid())throw new m("The active note path is not the canonical core Daily Note for one date.");let h=Re(s,o,f.format("YYYY-MM-DD"),r);if(h.length!==1)throw new m("The active note path can represent more than one calendar date.");l=h[0]}let d=`${a?`${a}/`:""}${l.format(o)}.md`;if(e.path.replaceAll("\\","/")!==d)throw new m("The active note path is not the canonical core Daily Note path.");if(!r||zt(s,o,l,r))throw new m("The active note path can represent more than one calendar date.");if(i&&!o.includes("/")){let f=i(e,"day");if(f?.isValid()&&f.format("YYYY-MM-DD")!==l.format("YYYY-MM-DD"))throw new m("The active note date could not be confirmed by core Daily Notes.")}let u=l.format("YYYY-MM-DD");if(!/^\d{4}-\d{2}-\d{2}$/u.test(u))throw new m("The active note did not resolve to one calendar date.");return u}function Ht(e,t){let n=new Date(Date.UTC(e,0,1+t));return`${String(n.getUTCFullYear()).padStart(4,"0")}-${String(n.getUTCMonth()+1).padStart(2,"0")}-${String(n.getUTCDate()).padStart(2,"0")}`}function Re(e,t,n,i){let r=Number(n.slice(0,4)),a=[],o=[r-100,r-1,r,r+1,r+100];for(let s of o){let l=new Date(Date.UTC(s,1,29)).getUTCDate()===29?366:365;for(let d=0;d<l;d+=1){let u=i(Ht(s,d));u?.isValid()&&u.format(t)===e&&a.push(u)}}return a}function zt(e,t,n,i){let r=n.format("YYYY-MM-DD");return Re(e,t,r,i).some(o=>o.format("YYYY-MM-DD")!==r)}function He(e,t,n,i,r,a){if(!t||t!==e||t.path!==e.path||t.basename!==e.basename)throw new m("The active Daily Note changed, moved, or was deleted; import aborted before writing.");if((n.folder??"")!==(i.folder??"")||(n.format??"")!==(i.format??"")||(n.template??"")!==(i.template??"")||r!==a)throw new m("The active Daily Note or core Daily Notes configuration changed; import aborted before writing.")}function Yt(e){return e.insertionMode==="heading"?`below ${e.insertionHeading}`:"at the active editor cursor"}function Bt(e){let t=[e.linkMatchingVaultNotes?"attendee-name links on (title names only)":"attendee-name links off",e.linkEventTitles?"Calendar URL links on (separate when needed)":"Calendar URL links off"];return`Heading ${e.eventHeadingLevel}, ${e.timeFormat}, ${t.join(", ")}`}function ze(e,t,n,i,r){if(!r){if(n===0)return`No Calendar events found for ${e}. The active Daily Note was updated.`;let d=n===1?"event":"events";return i===0?`Imported ${n} Calendar ${d} into ${t}. No uniquely matched attendee names appeared in event titles.`:`Imported ${n} Calendar ${d} into ${t} and added ${i} vault ${i===1?"link":"links"} for attendee names present in event titles.`}let a=`${Yt(r)}; ${Bt(r)}; managed block relocated`;if(n===0)return`No Calendar events found for ${e}; updated ${t} (${a}).`;let o=n===1?"event":"events",l=i===0?r.linkMatchingVaultNotes?"No uniquely matched attendee names appeared in event titles.":"Attendee-name matching links are disabled.":`Added ${i} vault ${i===1?"link":"links"} for attendee names present in event titles.`;return`Imported ${n} Calendar ${o} into ${t} (${a}). ${l}`}var v=class extends Error{constructor(t,n){super(n),this.name="DailyNoteProviderCompatibilityError",this.kind=t}},S=class extends Error{constructor(t){super(t),this.name="DailyNoteProviderError"}};function b(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function oe(e,t,n,i){let r=e[t];if(r===void 0)return n;if(typeof r!="string")throw new v(i,`${i==="core"?"Core Daily Notes":"Periodic Notes"} ${t} setting has an unsupported shape.`);return t==="format"&&r.trim()===""?n:t==="folder"||t==="template"?r.trim():r}function Ye(e,t){return{folder:oe(e,"folder","",t),format:oe(e,"format","YYYY-MM-DD",t),template:oe(e,"template","",t)}}function se(e){if(!b(e))return{candidates:[],errors:[new v("core","Core Daily Notes provider shape is unavailable.")]};let t=[],n=[];try{let r=(b(e.internalPlugins)&&b(e.internalPlugins.plugins)?e.internalPlugins.plugins:void 0)?.["daily-notes"];if(b(r)&&r.enabled===!0)if(!b(r.instance)||!b(r.instance.options))n.push(new v("core","Core Daily Notes settings/options are unavailable or unsupported."));else try{t.push({kind:"core",settings:Ye(r.instance.options,"core")})}catch(a){a instanceof v?n.push(a):n.push(new v("core","Core Daily Notes settings could not be read safely."))}}catch{n.push(new v("core","Core Daily Notes provider shape is unavailable or unsupported."))}try{let i=b(e.plugins)?e.plugins:void 0,r=i&&typeof i.getPlugin=="function"?i.getPlugin.bind(i):void 0;if(!r)return{candidates:t,errors:[...n,new v("periodic","Periodic Notes provider shape is unavailable or unsupported.")]};let a=r?.("periodic-notes");if(a!==void 0){if(!b(a)||!b(a.settings)||!b(a.settings.daily))n.push(new v("periodic","Periodic Notes daily settings are unavailable or unsupported."));else if(a.settings.daily.enabled===!0)try{t.push({kind:"periodic",settings:Ye(a.settings.daily,"periodic")})}catch(o){o instanceof v?n.push(o):n.push(new v("periodic","Periodic Notes daily settings could not be read safely."))}}}catch{n.push(new v("periodic","Periodic Notes provider shape is unavailable or unsupported."))}return{candidates:t,errors:n}}function le(e,t,n,i,r=[]){let a=[];for(let s of t)try{let l=Ve(e,s.settings,n,void 0,i);a.push({...s,targetDate:l})}catch{}if(!a.length){let s=r.length?` ${r.map(l=>l.message).join(" ")}`:"";throw new S(`The active note does not match configured Daily Notes or Periodic Notes settings.${s} Open a configured Daily Note or check those settings.`)}if(new Set(a.map(s=>s.targetDate)).size>1)throw new S("The active note matches multiple Daily Notes configurations with different dates; import is ambiguous.");return a.find(s=>s.kind==="core")??a[0]}function Be(e,t){if(e.kind!==t.kind||e.targetDate!==t.targetDate||(e.settings.folder??"")!==(t.settings.folder??"")||(e.settings.format??"")!==(t.settings.format??"")||(e.settings.template??"")!==(t.settings.template??""))throw new m("The Daily Note provider or configuration changed; import aborted before writing.")}var D=class extends Error{constructor(t){super(t),this.name="CalendarInsertionError"}};function de(e){return e.includes(`\r
`)?`\r
`:`
`}function Ot(e,t){return ie(e).filter(n=>n.text===t).map(n=>n.start)}function _t(e,t,n,i){let r=ie(e).find(u=>u.start===t&&u.text===n);if(!r)throw new D("The configured insertion heading could not be located.");let a=de(e),o=e.startsWith(`\r
`,r.contentEnd)?2:e[r.contentEnd]===`
`?1:0,s=o>0,l=a,d=s?a:"";return`${e.slice(0,r.contentEnd)}${l}${i}${d}${e.slice(r.contentEnd+o)}`}function ce(e,t,n){te(t);let r=V(e)?ee(e):e,a=Ot(r,n);if(a.length===0)throw new D(`The insertion heading ${n} was not found exactly once; import aborted without changing the note.`);if(a.length>1)throw new D(`The insertion heading ${n} must appear exactly once; it appears ${a.length} times, so import aborted without changing the note.`);return _t(r,a[0],n,t)}function Ut(e,t){return t?e<=t.start?e:e>=t.end?e-(t.end-t.start):t.start:Math.max(0,e)}function Oe(e,t,n){if(te(t),!Number.isSafeInteger(n)||n<0||n>e.length)throw new D("The active editor cursor is unavailable; import aborted without changing the note.");let i=V(e),r=Ut(n,i),a=i?ee(e):e,o=r>0&&a[r-1]!==`
`,s=r<a.length&&a[r]!==`
`,l=o?de(a):"",d=s?de(a):"";return{content:`${a.slice(0,r)}${l}${t}${d}${a.slice(r)}`,insertionOffset:r,oldRange:i}}var _=class extends c.Plugin{constructor(){super(...arguments);this.settings={...y};this.excludedVaultFoldersPersistedInvalid=!1}async onload(){await this.loadSettings(),this.addCommand({id:"import-calendar-events-into-active-daily-note",name:"Import Calendar events into active Daily Note",callback:()=>{this.importIntoActiveDailyNote()}}),this.addSettingTab(new ue(this.app,this))}async loadSettings(){let n=await this.loadData(),i=Ie(n);this.excludedVaultFoldersPersistedInvalid=i.excludedVaultFolders.malformed,this.excludedVaultFoldersInput=i.excludedVaultFolders.rawInput,this.settings={excludedVaultFolders:i.excludedVaultFolders.folders,insertionMode:i.insertionMode,insertionHeading:i.insertionHeading,eventHeadingLevel:i.eventHeadingLevel,timeFormat:i.timeFormat,linkMatchingVaultNotes:i.linkMatchingVaultNotes,linkEventTitles:i.linkEventTitles}}async saveSettings(){let n=Fe(this.settings.excludedVaultFolders),i=z(this.settings.insertionHeading);if(!i)throw new Error("Insertion heading must be a Markdown heading from # to ######, such as # Notes.");let r=Y(this.settings.insertionMode);if(!r)throw new Error("Insert Calendar events must be set to Below a heading or At the cursor.");let a=B(this.settings.eventHeadingLevel);if(!a)throw new Error("Event heading level must be Heading 2 through Heading 6.");let o=O(this.settings.timeFormat);if(!o)throw new Error("Time format must be 24-hour or 12-hour.");if(typeof this.settings.linkMatchingVaultNotes!="boolean"||typeof this.settings.linkEventTitles!="boolean")throw new Error("Linking settings must be enabled or disabled.");this.settings={excludedVaultFolders:n,insertionMode:r,insertionHeading:i,eventHeadingLevel:a,timeFormat:o,linkMatchingVaultNotes:L(this.settings.linkMatchingVaultNotes,y.linkMatchingVaultNotes),linkEventTitles:L(this.settings.linkEventTitles,y.linkEventTitles)};let s=this.excludedVaultFoldersPersistedInvalid?{...this.settings,excludedVaultFolders:this.excludedVaultFoldersInput??""}:this.settings;await this.saveData(s)}activeMarkdownEditor(n){let i=this.app.workspace.getActiveViewOfType(c.MarkdownView);return!i?.editor||!i.file||i.file.path!==n.path?null:i.editor}replaceEditorContent(n,i,r){if(i===r)return;let a=0;for(;a<i.length&&a<r.length&&i[a]===r[a];)a+=1;let o=0;for(;o<i.length-a&&o<r.length-a&&i[i.length-o-1]===r[r.length-o-1];)o+=1;let s=n.offsetToPos(a),l=n.offsetToPos(i.length-o);n.replaceRange(r.slice(a,r.length-o),s,l,"calendar-daily-note-linker")}async importIntoActiveDailyNote(){let n=new c.Notice("Checking the active Daily Note\u2026",0),i=r=>{n.setMessage(r),window.setTimeout(()=>n.hide(),1e4)};try{if(process.platform!=="darwin")throw new Error("Calendar Daily Note Linker requires macOS desktop and Calendar access.");let r=this.app.workspace.getActiveFile();if(!r||r.extension.toLowerCase()!=="md")throw new m("Open an existing configured Daily Note before running this command.");if(this.settings.linkMatchingVaultNotes&&this.excludedVaultFoldersPersistedInvalid)throw new Error("Saved vault folder exclusions are invalid. Correct them in settings before importing Calendar events.");let a=(w,p)=>(0,c.moment)(w,p,!0),o=w=>(0,c.moment)(w,"YYYY-MM-DD",!0),s=se(this.app),l=le(r,s.candidates,a,o,s.errors),d=l.targetDate;n.setMessage(`Reading Calendar for ${d}\u2026`);let u=await ve(d);u.warnings.length&&new c.Notice(`Calendar warning: ${u.warnings.join(" ")}`,8e3);let f=ye(this.settings.linkMatchingVaultNotes,()=>{n.setMessage("Matching vault notes\u2026");let w=this.app.vault.getMarkdownFiles().map(p=>({path:p.path,basename:p.basename,file:p,frontmatter:this.app.metadataCache.getFileCache(p)?.frontmatter}));return De(be(w,this.settings.excludedVaultFolders),p=>{if(!p.file)throw new Error(`Vault note is unavailable: ${p.path}`);return{linkText:this.app.metadataCache.fileToLinktext(p.file,r.path,!0)}})});this.settings.linkMatchingVaultNotes||n.setMessage("Skipping vault note matching\u2026");let h=$e(u,f,this.settings);n.setMessage("Writing the active Daily Note\u2026");let U=this.app.workspace.getActiveFile();if(!U||this.app.vault.getAbstractFileByPath(r.path)!==r)throw new m("The active Daily Note changed, moved, or was deleted; import aborted before writing.");let ge=se(this.app),W=le(U,ge.candidates,a,o,ge.errors);He(r,U,l.settings,W.settings,d,W.targetDate),Be(l,W);let x=this.activeMarkdownEditor(r);if(this.settings.insertionMode==="cursor"){if(!x)throw new m("At the cursor requires the active Daily Note's Markdown editor and a usable cursor; import aborted without changing the note.");let w=x.getValue(),p=x.getCursor(),me=x.posToOffset(p),_e=Oe(w,h.block,me);this.replaceEditorContent(x,w,_e.content)}else if(x){let w=x.getValue(),p=ce(w,h.block,this.settings.insertionHeading);this.replaceEditorContent(x,w,p)}else await this.app.vault.process(r,w=>ce(w,h.block,this.settings.insertionHeading));i(ze(d,r.basename,h.eventCount,h.linkCount,this.settings))}catch(r){let a=r instanceof k||r instanceof S||r instanceof m||r instanceof D?r.message:`Could not import Calendar events: ${r instanceof Error?r.message:String(r)}`;i(a)}}},ue=class extends c.PluginSettingTab{constructor(t,n){super(t,n),this.plugin=n}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Calendar Daily Note Linker"}),this.plugin.excludedVaultFoldersPersistedInvalid&&t.createEl("p",{text:"Saved vault folder exclusions are invalid; correct them before importing Calendar events."}),t.createEl("h3",{text:"Insertion"}),new c.Setting(t).setName("Insert Calendar events").setDesc("Choose where the managed Calendar block is placed in the active Daily Note.").addDropdown(n=>{n.addOption("heading","Below a heading").addOption("cursor","At the cursor").setValue(this.plugin.settings.insertionMode).onChange(i=>{this.commitInsertionMode(n,i)})}),this.plugin.settings.insertionMode==="heading"&&new c.Setting(t).setName("Insertion heading").setDesc("The managed block appears immediately below this exact standalone Markdown heading; outer incidental whitespace is trimmed, internal whitespace is preserved, and the field saves on blur. Older sectionHeading content is not used as the destination.").addText(n=>{n.setPlaceholder(y.insertionHeading).setValue(this.plugin.settings.insertionHeading),n.inputEl.addEventListener("blur",()=>{this.commitInsertionHeading(n)})}),t.createEl("h3",{text:"Formatting"}),new c.Setting(t).setName("Event heading level").setDesc("Each event title is rendered as a Markdown heading.").addDropdown(n=>{for(let i of[2,3,4,5,6])n.addOption(String(i),`Heading ${i}`);n.setValue(String(this.plugin.settings.eventHeadingLevel)).onChange(i=>{this.commitEventHeadingLevel(n,i)})}),new c.Setting(t).setName("Time format").setDesc("Timed events use the Calendar event's local timezone.").addDropdown(n=>{n.addOption("24-hour","24-hour \u2014 09:00 \u2013 09:30").addOption("12-hour","12-hour \u2014 9:00 AM \u2013 9:30 AM").setValue(this.plugin.settings.timeFormat).onChange(i=>{this.commitTimeFormat(n,i)})}),new c.Setting(t).setName("Link matching vault notes").setDesc("Add deterministic vault links for uniquely matched attendee names that appear in event titles.").addToggle(n=>{n.setValue(this.plugin.settings.linkMatchingVaultNotes).onChange(i=>{this.commitBoolean(n,"linkMatchingVaultNotes",i)})}),new c.Setting(t).setName("Link event titles to Calendar").setDesc("Link event titles to Calendar when available; with an in-title vault link, add a separate Calendar link on the same line.").addToggle(n=>{n.setValue(this.plugin.settings.linkEventTitles).onChange(i=>{this.commitBoolean(n,"linkEventTitles",i)})}),t.createEl("h3",{text:"Vault matching"}),new c.Setting(t).setName("Vault folders to exclude").setDesc("Optional vault-relative folders to skip when matching Calendar attendees; one path per line; exclusions include subfolders; blank searches all Markdown notes.").addTextArea(n=>{n.setPlaceholder(`Archive
Templates
Private/People`).setValue(this.plugin.excludedVaultFoldersInput??this.plugin.settings.excludedVaultFolders.join(`
`)),n.inputEl.addEventListener("blur",()=>{this.commitExcludedVaultFolders(n)})}),t.createEl("p",{text:"Open an existing configured Daily Note, then run the command; it updates that open note for its date and relocates its one managed Calendar block."})}async commitInsertionMode(t,n){let i=this.plugin.settings.insertionMode,r=Y(n);if(!r){t.setValue(i),new c.Notice("Choose Below a heading or At the cursor.");return}this.plugin.settings.insertionMode=r;try{await this.plugin.saveSettings(),this.display()}catch(a){this.plugin.settings.insertionMode=i,t.setValue(i),new c.Notice(`Could not save insertion mode: ${a instanceof Error?a.message:String(a)}`)}}async commitInsertionHeading(t){let n=this.plugin.settings.insertionHeading,i=z(t.getValue());if(!i){t.setValue(n),new c.Notice("Use an exact Markdown heading from # to ######, such as # Notes.");return}this.plugin.settings.insertionHeading=i,t.setValue(i);try{await this.plugin.saveSettings()}catch(r){this.plugin.settings.insertionHeading=n,t.setValue(n),new c.Notice(`Could not save the Insertion heading: ${r instanceof Error?r.message:String(r)}`)}}async commitEventHeadingLevel(t,n){let i=this.plugin.settings.eventHeadingLevel,r=B(n);if(!r){t.setValue(String(i)),new c.Notice("Choose an event heading level from Heading 2 through Heading 6.");return}this.plugin.settings.eventHeadingLevel=r;try{await this.plugin.saveSettings()}catch(a){this.plugin.settings.eventHeadingLevel=i,t.setValue(String(i)),new c.Notice(`Could not save the Event heading level: ${a instanceof Error?a.message:String(a)}`)}}async commitTimeFormat(t,n){let i=this.plugin.settings.timeFormat,r=O(n);if(!r){t.setValue(i),new c.Notice("Choose 24-hour or 12-hour time format.");return}this.plugin.settings.timeFormat=r;try{await this.plugin.saveSettings()}catch(a){this.plugin.settings.timeFormat=i,t.setValue(i),new c.Notice(`Could not save the Time format: ${a instanceof Error?a.message:String(a)}`)}}async commitBoolean(t,n,i){let r=this.plugin.settings[n];this.plugin.settings[n]=i;try{await this.plugin.saveSettings()}catch(a){this.plugin.settings[n]=r,t.setValue(r),new c.Notice(`Could not save linking setting: ${a instanceof Error?a.message:String(a)}`)}}async commitExcludedVaultFolders(t){let n=[...this.plugin.settings.excludedVaultFolders],i=this.plugin.excludedVaultFoldersPersistedInvalid,r=this.plugin.excludedVaultFoldersInput,a=H(t.getValue());if(!a){this.plugin.excludedVaultFoldersPersistedInvalid||t.setValue(n.join(`
`)),new c.Notice("Use one safe vault-relative folder per line, or leave the field blank.");return}this.plugin.settings.excludedVaultFolders=a,this.plugin.excludedVaultFoldersPersistedInvalid=!1,this.plugin.excludedVaultFoldersInput=void 0,t.setValue(a.join(`
`));try{await this.plugin.saveSettings()}catch(o){this.plugin.settings.excludedVaultFolders=n,this.plugin.excludedVaultFoldersPersistedInvalid=i,this.plugin.excludedVaultFoldersInput=r,t.setValue(i?r??"":n.join(`
`)),new c.Notice(`Could not save excluded folders: ${o instanceof Error?o.message:String(o)}`)}}};
