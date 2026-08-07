"use strict";var R=Object.defineProperty;var be=Object.getOwnPropertyDescriptor;var Ce=Object.getOwnPropertyNames;var Ne=Object.prototype.hasOwnProperty;var xe=(e,t)=>{for(var n in t)R(e,n,{get:t[n],enumerable:!0})},ke=(e,t,n,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of Ce(t))!Ne.call(e,r)&&r!==n&&R(e,r,{get:()=>t[r],enumerable:!(i=be(t,r))||i.enumerable});return e};var Ee=e=>ke(R({},"__esModule",{value:!0}),e);var tt={};xe(tt,{default:()=>F});module.exports=Ee(tt);var u=require("obsidian");var ee=require("node:child_process"),te=require("node:util");var d=class extends Error{constructor(t){super(t),this.name="CalendarPayloadValidationError"}};function A(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function v(e,t){if(typeof e!="string")throw new d(`${t} must be a string`);return e}function D(e,t){if(e!==null&&typeof e!="string")throw new d(`${t} must be a string or null`);return e}function T(e,t){let n=v(e,t);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(n)||Number.isNaN(Date.parse(n)))throw new d(`${t} must be a valid ISO date`);return n}function Y(e){let t=v(e,"targetDate");if(!/^\d{4}-\d{2}-\d{2}$/.test(t))throw new d("targetDate must be YYYY-MM-DD");let[n,i,r]=t.split("-").map(Number),a=new Date(Date.UTC(n,i-1,r));if(a.getUTCFullYear()!==n||a.getUTCMonth()!==i-1||a.getUTCDate()!==r)throw new d("targetDate must be a valid calendar date");return t}function Ae(e){return/^(?:EventKit|Some EventKit) (?:calendar|event URL|event title|attendee|attendee display name|attendee email|attendee status) data is unavailable on this macOS\/source\.$/.test(e)}var Te=new Set(["unknown","pending","accepted","declined","tentative","delegated","completed","in-process"]);function Se(e,t){let n=v(e,`attendee ${t} status`);if(!Te.has(n))throw new d(`attendee ${t} status is not a stable EventKit status`);return n}function $e(e,t){if(!A(e))throw new d(`events attendee ${t} must be an object`);return{displayName:D(e.displayName,`attendee ${t} displayName`),email:D(e.email,`attendee ${t} email`),status:Se(e.status,t)}}function Fe(e,t){if(!A(e))throw new d(`event ${t} must be an object`);let n=e.attendees;if(!Array.isArray(n))throw new d(`event ${t} attendees must be an array`);let i=T(e.start,`event ${t} start`),r=T(e.end,`event ${t} end`);if(Date.parse(r)<Date.parse(i))throw new d(`event ${t} end cannot precede start`);if(typeof e.allDay!="boolean")throw new d(`event ${t} allDay must be a boolean`);return{id:D(e.id,`event ${t} id`),calendar:D(e.calendar,`event ${t} calendar`),title:v(e.title,`event ${t} title`),start:i,end:r,allDay:e.allDay,url:D(e.url,`event ${t} url`),location:D(e.location,`event ${t} location`),notes:e.notes===null?null:(()=>{throw new d(`event ${t} notes must be null`)})(),attendees:n.map((a,o)=>$e(a,o))}}function Q(e){let t;try{t=JSON.parse(e)}catch{throw new d("Calendar bridge output was not valid JSON")}return Ie(t)}function Ie(e){if(!A(e))throw new d("Calendar bridge output must be a JSON object");if(e.schemaVersion!==1)throw new d("Calendar bridge output has an unsupported schema version");if(!A(e.range))throw new d("Calendar bridge output range must be an object");let t=T(e.range.start,"range start"),n=T(e.range.end,"range end");if(Date.parse(n)<=Date.parse(t))throw new d("range end must be after range start");let i=v(e.range.timeZone,"range timeZone").trim();if(!i)throw new d("range timeZone cannot be empty");if(!Array.isArray(e.events))throw new d("Calendar bridge output events must be an array");if(!Array.isArray(e.warnings)||e.warnings.some(a=>typeof a!="string"))throw new d("Calendar bridge output warnings must be an array of strings");let r=e.warnings;return{schemaVersion:1,source:v(e.source,"source"),targetDate:Y(e.targetDate),range:{start:t,end:n,timeZone:i},events:e.events.map((a,o)=>Fe(a,o)),warnings:r.map(a=>{if(!Ae(a))throw new d("Calendar bridge warnings may only describe unavailable optional EventKit data");return a})}}var X=`/*
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
var EVENTKIT_AUTH_AUTHORIZED = 3;
var EVENTKIT_PERMISSION_CODES = {
  denied: "EVENTKIT_PERMISSION_DENIED",
  restricted: "EVENTKIT_PERMISSION_RESTRICTED",
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

function requestEventKitAccess(store) {
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
  if (status === EVENTKIT_AUTH_AUTHORIZED && granted.value) return;
  if (status === EVENTKIT_AUTH_RESTRICTED) throw permissionError(EVENTKIT_PERMISSION_CODES.restricted);
  if (status === EVENTKIT_AUTH_DENIED || !granted.value) throw permissionError(EVENTKIT_PERMISSION_CODES.denied);
  throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
}

function eventStore() {
  var status = authorizationStatus();
  if (status === EVENTKIT_AUTH_DENIED) throw permissionError(EVENTKIT_PERMISSION_CODES.denied);
  if (status === EVENTKIT_AUTH_RESTRICTED) throw permissionError(EVENTKIT_PERMISSION_CODES.restricted);
  if (status !== EVENTKIT_AUTH_NOT_DETERMINED && status !== EVENTKIT_AUTH_AUTHORIZED) {
    throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
  }

  var store;
  try {
    store=$.EKEventStore.alloc.initWithAccessToEntityTypes($.EKEntityMaskEvent);
  } catch (error) {
    throw permissionError(EVENTKIT_PERMISSION_CODES.unavailable);
  }
  if (status === EVENTKIT_AUTH_NOT_DETERMINED) requestEventKitAccess(store);
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
`;var Me=(0,te.promisify)(ee.execFile),Ve=async(e,t,n)=>await Me(e,t,n),h=class extends Error{constructor(t,n=!1){super(t),this.name="CalendarBridgeError",this.isPermissionFailure=n}},Re=/\bEVENTKIT_PERMISSION_(?:DENIED|RESTRICTED|REQUEST_TIMEOUT|UNAVAILABLE)\b/;function k(e){return typeof e!="string"?"":e.replace(/[\u0000-\u001f\u007f-\u009f]/gu," ").replace(/\s+/gu," ").trim().slice(0,500)}function z(e){return(typeof e=="string"?e.match(Re):null)?.[0]??null}function L(e){return`EventKit Calendar permission failed (${e}). Allow Calendar access in System Settings \u2192 Privacy & Security \u2192 Calendars, then try again.`}function _(e){return`EventKit bridge failed: ${e||"no diagnostic details were returned."}`}function Ye(e){let t=e,n=k(t?.stderr),i=k(t?.message);return{details:n||i,code:z(`${n} ${i}`)}}async function ne(e,t=Ve){try{Y(e)}catch(r){throw new h(r instanceof Error?r.message:"Calendar target date must be YYYY-MM-DD.")}let n;try{n=await t("/usr/bin/osascript",["-l","JavaScript","-e",X,e],{encoding:"utf8",timeout:3e4,maxBuffer:2*1024*1024,shell:!1,windowsHide:!0})}catch(r){let a=Ye(r);throw a.code?new h(L(a.code),!0):new h(_(a.details))}let i=n.stdout.trim();if(!i){let r=k(n.stderr),a=z(n.stderr);throw a?new h(L(a),!0):new h(_(r))}try{let r=Q(i);if(r.targetDate!==e)throw new Error(`Calendar bridge returned ${r.targetDate} instead of ${e}.`);return r}catch(r){let a=k(r instanceof Error?r.message:String(r)),o=k(n.stderr),s=z(`${o} ${a}`);throw s?new h(L(s),!0):new h(_([o,a].filter(Boolean).join(" | ")))}}function U(e,t,n){if(!t)return;let i=e.get(t)??[];i.some(r=>r.path===n.path)||(i.push(n),i.sort((r,a)=>r.path.localeCompare(a.path))),e.set(t,i)}function S(e){return e.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase()}function re(e){return e.normalize("NFKC").trim().replace(/\s+/gu,"").toLowerCase()}function O(e,t){let n=e?.[t];return typeof n=="string"?[n]:Array.isArray(n)?n.filter(i=>typeof i=="string"):[]}function Le(e){let t=e.path.replaceAll("\\","/"),n=e.basename||t.split("/").at(-1)?.replace(/\.md$/i,"")||"";return{path:t,basename:n,file:e.file}}function _e(e,t){let n=e.replaceAll("\\","/");return t.some(i=>{let r=i.replaceAll("\\","/").replace(/\/+$/u,"");return n===r||n.startsWith(`${r}/`)})}function ie(e,t){let n=new Map,i=new Map;for(let r of e){let a=r.path.replaceAll("\\","/");if(!a.toLowerCase().endsWith(".md")||_e(a,t))continue;let o=Le(r);U(i,S(o.basename),o);for(let s of O(r.frontmatter,"aliases"))U(i,S(s),o);for(let s of[...O(r.frontmatter,"email"),...O(r.frontmatter,"emails")])U(n,re(s),o)}return{byEmail:n,byName:i}}function ze(e,t){let n=t.email?re(t.email):"";if(n){let a=e.byEmail.get(n);if(a?.length===1)return a[0];if(a&&a.length>1)return null}let i=t.displayName?S(t.displayName):"";if(!i)return null;let r=e.byName.get(i);return r?.length===1?r[0]:null}function Ue(e,t){let n=[];for(let i of t){let r=ze(e,i);r&&!n.some(a=>a.path===r.path)&&n.push(r)}return n}function ae(e,t,n){let i=Ue(e,t);if(i.length>0)return i;let r=e.byName.get(S(n));return r?.length===1?[r[0]]:[]}function oe(e,t){let n=new Map,i=r=>r.map(a=>{let o=n.get(a.path);return o===void 0&&(o=t(a),n.set(a.path,o)),{...a,markdownLink:o}});return{byEmail:new Map([...e.byEmail].map(([r,a])=>[r,i(a)])),byName:new Map([...e.byName].map(([r,a])=>[r,i(a)]))}}var P="<!-- calendar-daily-note-linker:start -->",b="<!-- calendar-daily-note-linker:end -->",C=class extends Error{constructor(t){super(t),this.name="CalendarBlockError"}};function le(e){return[P,...e.map(ce),b].join(`
`)}function de(e,t){Oe(t);let n=[],i=[],r=e.split(`
`);if(r.forEach((s,l)=>{let p=s.endsWith("\r")?s.slice(0,-1):s,f=p===P,y=p===b;if(f&&n.push(l),y&&i.push(l),(p.includes(P)||p.includes(b))&&!f&&!y)throw new C("The Calendar section marker must be on an exact standalone line.")}),n.length===0&&i.length===0)return He(e,t);if(n.length!==1||i.length!==1||n[0]>=i[0])throw new C("The Calendar section markers are duplicated, incomplete, or out of order.");let a=se(r,n[0]),o=se(r,i[0]+1);return`${e.slice(0,a)}${t}${e.slice(o)}`}function Oe(e){let t=e.split(`
`).map(n=>n.endsWith("\r")?n.slice(0,-1):n);if(t[0]!==P||t[t.length-1]!==b)throw new C("Generated Calendar content has invalid section markers.");if(t.slice(1,-1).some(n=>n.includes(P)||n.includes(b)))throw new C("Generated Calendar content contains a section marker literal.")}function ce(e){return e.replace(/\r\n?|\n|\u2028|\u2029/gu," ").replace(/[\u0000-\u001f\u007f-\u009f]/gu,"").replaceAll(P,"[calendar section start]").replaceAll(b,"[calendar section end]")}function H(e){return ce(e).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replace(/[\\`*_{}\[\]()#+\-.!|>~]/gu,"\\$&")}function He(e,t){let n=e.length>0&&!e.endsWith(`
`)?`
`:"";return`${e}${n}${t}
`}function se(e,t){let n=0;for(let i=0;i<t&&i<e.length;i+=1)n+=e[i].length+1;return n}function Ke(e){return e.replaceAll("\\","\\\\").replace(/[\s<>]/gu,t=>encodeURIComponent(t)).replaceAll("(","\\(").replaceAll(")","\\)").replaceAll('"',"%22")}function je(e){if(!e?.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(e)||e.includes("<!-- calendar-daily-note-linker:start -->")||e.includes("<!-- calendar-daily-note-linker:end -->"))return null;try{let t=new URL(e.trim());return t.protocol==="http:"||t.protocol==="https:"?t.href:null}catch{return null}}function Be(e,t){if(e.allDay!==t.allDay)return e.allDay?-1:1;let n=Date.parse(e.start)-Date.parse(t.start);if(n!==0)return n;let i=Date.parse(e.end)-Date.parse(t.end);return i!==0?i:e.title.localeCompare(t.title)}function ue(e,t){let n={timeZone:t,hour:"numeric",minute:"2-digit",hour12:!0};try{return new Intl.DateTimeFormat("en-US",n).format(new Date(e))}catch{return new Intl.DateTimeFormat("en-US",{...n,timeZone:void 0}).format(new Date(e))}}function We(e,t,n){let i=je(e.url),r=i?`[${H(e.title)}](${Ke(i)})`:H(e.title),o=ae(n,e.attendees,e.title).map(l=>l.markdownLink).filter(l=>!!l),s=e.allDay?"All day":`${ue(e.start,t.range.timeZone)}\u2013${ue(e.end,t.range.timeZone)}`;return{line:`- ${r}${o.length?` \u2014 ${o.join(", ")}`:""} \u2014 ${s}`,linkCount:o.length}}function pe(e,t,n){let i=[t],r=[...e.events].sort(Be),a=0;if(!r.length)i.push(`No Calendar events found for ${e.targetDate}.`);else for(let o of r){let s=We(o,e,n);i.push(s.line),a+=s.linkCount}return{block:le(i),eventCount:r.length,linkCount:a}}var E={excludedVaultFolders:[],sectionHeading:"## Calendar"},K=class extends Error{constructor(){super("Vault folder exclusions are malformed. Correct them in settings before importing Calendar events."),this.name="ExcludedVaultFolderError"}};function Ze(e){let t=e.replaceAll("\\","/"),n=t.split("/");if(!(!t||t.startsWith("/")||/^[A-Za-z]:/.test(t)||n.some(i=>i.length===0||i==="."||i===".."||i.includes("\0"))))return t}function $(e){let t=Array.isArray(e),n=typeof e=="string"?e.split(/\r\n?|\n|\u2028|\u2029/gu):t&&e.every(r=>typeof r=="string")?e:void 0;if(!n)return;let i=[];for(let r of n){if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(r))return;if(!r.trim())continue;let a=Ze(r);if(!a)return;i.includes(a)||i.push(a)}return i}function ge(e){if(e===void 0)return E.excludedVaultFolders;let t=$(e);if(!t)throw new K;return t}function fe(e){if(e===void 0)return{folders:[],malformed:!1};let t=$(e);return t?{folders:t,malformed:!1}:{folders:[],malformed:!0,rawInput:typeof e=="string"?e:Array.isArray(e)?e.map(String).join(`
`):String(e)}}function j(e){if(typeof e!="string")return;let t=e.trim().replace(/[\r\n]+/g," ").replace(/\s+/g," ");if(!(!/^#{1,6}\s+\S/.test(t)||t.includes("<!--")||t.includes("-->")||t.includes("\0")))return t}function B(e){return j(e)??E.sectionHeading}var c=class extends Error{constructor(t){super(t),this.name="ActiveDailyNoteError"}};function Je(e){return(e??"").replaceAll("\\","/").replace(/\/+$/u,"")}function Ge(e){let t=[],n=0;for(;n<e.length;){if(e[n]==="\\"){n+=2;continue}if(e[n]==="["){let i=e.indexOf("]",n+1);n=i===-1?e.length:i+1;continue}if(/[YMD]/u.test(e[n])){let i=n,r=e[n];for(;n<e.length&&e[n]===r&&n-i<5;)n+=1;t.push({token:e.slice(i,n),start:i,end:n});continue}n+=1}return t}function qe(e){if(typeof e!="string"||!e)return!1;let t=Ge(e),n=t.filter(({token:s})=>s.startsWith("D")),i=n.some(({token:s})=>s.length>=3),r=n.some(({token:s})=>s.length<=2),a=t.some(({token:s})=>s.startsWith("M"));return!t.some(({token:s})=>s.startsWith("Y"))||!(i||a&&r)?!1:t.some(({token:s})=>s==="YYYY")}function Qe(e,t){let n=e.replaceAll("\\","/"),i=t?`${t}/`:"";if(t&&!n.startsWith(i))throw new c("The active note is outside the configured core Daily Notes folder.");let r=n.slice(i.length);if(!r.endsWith(".md"))throw new c("The active note must be a Markdown Daily Note.");return r.slice(0,-3)}function me(e,t,n,i,r){if(e.extension.toLowerCase()!=="md")throw new c("Open an existing configured Daily Note before running this command.");if(!qe(t.format))throw new c("The core Daily Notes filename format cannot identify one calendar date.");let a=Je(t.folder),o=t.format,s=Qe(e.path,a),l=n(s,o,!0);if(!l?.isValid()||l.format(o)!==s){if(!r)throw new c("The active note path is not the canonical core Daily Note for one date.");let y=n(s,o,!1);if(!y?.isValid())throw new c("The active note path is not the canonical core Daily Note for one date.");let x=he(s,o,y.format("YYYY-MM-DD"),r);if(x.length!==1)throw new c("The active note path can represent more than one calendar date.");l=x[0]}let p=`${a?`${a}/`:""}${l.format(o)}.md`;if(e.path.replaceAll("\\","/")!==p)throw new c("The active note path is not the canonical core Daily Note path.");if(!r||et(s,o,l,r))throw new c("The active note path can represent more than one calendar date.");if(i&&!o.includes("/")){let y=i(e,"day");if(y?.isValid()&&y.format("YYYY-MM-DD")!==l.format("YYYY-MM-DD"))throw new c("The active note date could not be confirmed by core Daily Notes.")}let f=l.format("YYYY-MM-DD");if(!/^\d{4}-\d{2}-\d{2}$/u.test(f))throw new c("The active note did not resolve to one calendar date.");return f}function Xe(e,t){let n=new Date(Date.UTC(e,0,1+t));return`${String(n.getUTCFullYear()).padStart(4,"0")}-${String(n.getUTCMonth()+1).padStart(2,"0")}-${String(n.getUTCDate()).padStart(2,"0")}`}function he(e,t,n,i){let r=Number(n.slice(0,4)),a=[],o=[r-100,r-1,r,r+1,r+100];for(let s of o){let l=new Date(Date.UTC(s,1,29)).getUTCDate()===29?366:365;for(let p=0;p<l;p+=1){let f=i(Xe(s,p));f?.isValid()&&f.format(t)===e&&a.push(f)}}return a}function et(e,t,n,i){let r=n.format("YYYY-MM-DD");return he(e,t,r,i).some(o=>o.format("YYYY-MM-DD")!==r)}function ye(e,t,n,i,r,a){if(!t||t!==e||t.path!==e.path||t.basename!==e.basename)throw new c("The active Daily Note changed, moved, or was deleted; import aborted before writing.");if((n.folder??"")!==(i.folder??"")||(n.format??"")!==(i.format??"")||(n.template??"")!==(i.template??"")||r!==a)throw new c("The active Daily Note or core Daily Notes configuration changed; import aborted before writing.")}function we(e,t,n,i){if(n===0)return`No Calendar events found for ${e}. The active Daily Note was updated.`;let r=n===1?"event":"events";return i===0?`Imported ${n} Calendar ${r} into ${t}. No attendees or event titles uniquely matched vault notes.`:`Imported ${n} Calendar ${r} into ${t} and added ${i} vault ${i===1?"link":"links"}.`}var m=class extends Error{constructor(t,n){super(n),this.name="DailyNoteProviderCompatibilityError",this.kind=t}},N=class extends Error{constructor(t){super(t),this.name="DailyNoteProviderError"}};function w(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function W(e,t,n,i){let r=e[t];if(r===void 0)return n;if(typeof r!="string")throw new m(i,`${i==="core"?"Core Daily Notes":"Periodic Notes"} ${t} setting has an unsupported shape.`);return t==="format"&&r.trim()===""?n:t==="folder"||t==="template"?r.trim():r}function De(e,t){return{folder:W(e,"folder","",t),format:W(e,"format","YYYY-MM-DD",t),template:W(e,"template","",t)}}function Z(e){if(!w(e))return{candidates:[],errors:[new m("core","Core Daily Notes provider shape is unavailable.")]};let t=[],n=[];try{let r=(w(e.internalPlugins)&&w(e.internalPlugins.plugins)?e.internalPlugins.plugins:void 0)?.["daily-notes"];if(w(r)&&r.enabled===!0)if(!w(r.instance)||!w(r.instance.options))n.push(new m("core","Core Daily Notes settings/options are unavailable or unsupported."));else try{t.push({kind:"core",settings:De(r.instance.options,"core")})}catch(a){a instanceof m?n.push(a):n.push(new m("core","Core Daily Notes settings could not be read safely."))}}catch{n.push(new m("core","Core Daily Notes provider shape is unavailable or unsupported."))}try{let i=w(e.plugins)?e.plugins:void 0,r=i&&typeof i.getPlugin=="function"?i.getPlugin.bind(i):void 0;if(!r)return{candidates:t,errors:[...n,new m("periodic","Periodic Notes provider shape is unavailable or unsupported.")]};let a=r?.("periodic-notes");if(a!==void 0){if(!w(a)||!w(a.settings)||!w(a.settings.daily))n.push(new m("periodic","Periodic Notes daily settings are unavailable or unsupported."));else if(a.settings.daily.enabled===!0)try{t.push({kind:"periodic",settings:De(a.settings.daily,"periodic")})}catch(o){o instanceof m?n.push(o):n.push(new m("periodic","Periodic Notes daily settings could not be read safely."))}}}catch{n.push(new m("periodic","Periodic Notes provider shape is unavailable or unsupported."))}return{candidates:t,errors:n}}function J(e,t,n,i,r=[]){let a=[];for(let s of t)try{let l=me(e,s.settings,n,void 0,i);a.push({...s,targetDate:l})}catch{}if(!a.length){let s=r.length?` ${r.map(l=>l.message).join(" ")}`:"";throw new N(`The active note does not match configured Daily Notes or Periodic Notes settings.${s} Open a configured Daily Note or check those settings.`)}if(new Set(a.map(s=>s.targetDate)).size>1)throw new N("The active note matches multiple Daily Notes configurations with different dates; import is ambiguous.");return a.find(s=>s.kind==="core")??a[0]}function ve(e,t){if(e.kind!==t.kind||e.targetDate!==t.targetDate||(e.settings.folder??"")!==(t.settings.folder??"")||(e.settings.format??"")!==(t.settings.format??"")||(e.settings.template??"")!==(t.settings.template??""))throw new c("The Daily Note provider or configuration changed; import aborted before writing.")}var F=class extends u.Plugin{constructor(){super(...arguments);this.settings={...E};this.excludedVaultFoldersPersistedInvalid=!1}async onload(){await this.loadSettings(),this.addCommand({id:"import-calendar-events-into-active-daily-note",name:"Import Calendar events into active Daily Note",callback:()=>{this.importIntoActiveDailyNote()}}),this.addSettingTab(new G(this.app,this))}async loadSettings(){let n=await this.loadData(),i=fe(n?.excludedVaultFolders);this.excludedVaultFoldersPersistedInvalid=i.malformed,this.excludedVaultFoldersInput=i.rawInput,this.settings={excludedVaultFolders:i.folders,sectionHeading:B(n?.sectionHeading)}}async saveSettings(){this.settings.excludedVaultFolders=ge(this.settings.excludedVaultFolders),this.settings.sectionHeading=B(this.settings.sectionHeading);let n=this.excludedVaultFoldersPersistedInvalid?{...this.settings,excludedVaultFolders:this.excludedVaultFoldersInput??""}:this.settings;await this.saveData(n)}async importIntoActiveDailyNote(){let n=new u.Notice("Checking the active Daily Note\u2026",0),i=r=>{n.setMessage(r),window.setTimeout(()=>n.hide(),1e4)};try{if(process.platform!=="darwin")throw new Error("Calendar Daily Note Linker requires macOS desktop and Calendar access.");let r=this.app.workspace.getActiveFile();if(!r||r.extension.toLowerCase()!=="md")throw new c("Open an existing configured Daily Note before running this command.");if(this.excludedVaultFoldersPersistedInvalid)throw new Error("Saved vault folder exclusions are invalid. Correct them in settings before importing Calendar events.");let a=(g,Pe)=>(0,u.moment)(g,Pe,!0),o=g=>(0,u.moment)(g,"YYYY-MM-DD",!0),s=Z(this.app),l=J(r,s.candidates,a,o,s.errors),p=l.targetDate;n.setMessage(`Reading Calendar for ${p}\u2026`);let f=await ne(p);f.warnings.length&&new u.Notice(`Calendar warning: ${f.warnings.join(" ")}`,8e3),n.setMessage("Matching vault notes\u2026");let y=this.app.vault.getMarkdownFiles().map(g=>({path:g.path,basename:g.basename,file:g,frontmatter:this.app.metadataCache.getFileCache(g)?.frontmatter})),x=oe(ie(y,this.settings.excludedVaultFolders),g=>{if(!g.file)throw new Error(`Vault note is unavailable: ${g.path}`);return this.app.fileManager.generateMarkdownLink(g.file,r.path,void 0,g.basename||void 0)}),I=pe(f,this.settings.sectionHeading,x);n.setMessage("Writing the active Daily Note\u2026");let M=this.app.workspace.getActiveFile();if(!M||this.app.vault.getAbstractFileByPath(r.path)!==r)throw new c("The active Daily Note changed, moved, or was deleted; import aborted before writing.");let q=Z(this.app),V=J(M,q.candidates,a,o,q.errors);ye(r,M,l.settings,V.settings,p,V.targetDate),ve(l,V),await this.app.vault.process(r,g=>de(g,I.block)),i(we(p,r.basename,I.eventCount,I.linkCount))}catch(r){let a=r instanceof h||r instanceof N||r instanceof c?r.message:`Could not import Calendar events: ${r instanceof Error?r.message:String(r)}`;i(a)}}},G=class extends u.PluginSettingTab{constructor(t,n){super(t,n),this.plugin=n}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Calendar Daily Note Linker"}),this.plugin.excludedVaultFoldersPersistedInvalid&&t.createEl("p",{text:"Saved vault folder exclusions are invalid; correct them before importing Calendar events."}),new u.Setting(t).setName("Vault folders to exclude").setDesc("Optional vault-relative folders to skip when matching Calendar attendees; one path per line; exclusions include subfolders; blank searches all Markdown notes.").addTextArea(n=>{n.setPlaceholder(`Archive
Templates
Private/People`).setValue(this.plugin.excludedVaultFoldersInput??this.plugin.settings.excludedVaultFolders.join(`
`)),n.inputEl.addEventListener("blur",()=>{this.commitExcludedVaultFolders(n)})}),new u.Setting(t).setName("Section heading").setDesc("Markdown heading used inside the managed Calendar section; saves when focus leaves the field (for example ## Calendar).").addText(n=>{n.setPlaceholder(E.sectionHeading).setValue(this.plugin.settings.sectionHeading),n.inputEl.addEventListener("blur",()=>{this.commitSectionHeading(n)})}),t.createEl("p",{text:"Open an existing configured Daily Note, then run the command; it updates that open note for its date."})}async commitSectionHeading(t){let n=this.plugin.settings.sectionHeading,i=j(t.getValue());if(!i){t.setValue(n),new u.Notice("Use a Markdown heading from # to ######, such as ## Calendar.");return}this.plugin.settings.sectionHeading=i,t.setValue(i);try{await this.plugin.saveSettings()}catch(r){this.plugin.settings.sectionHeading=n,t.setValue(n),new u.Notice(`Could not save the Section heading: ${r instanceof Error?r.message:String(r)}`)}}async commitExcludedVaultFolders(t){let n=[...this.plugin.settings.excludedVaultFolders],i=this.plugin.excludedVaultFoldersPersistedInvalid,r=this.plugin.excludedVaultFoldersInput,a=$(t.getValue());if(!a){this.plugin.excludedVaultFoldersPersistedInvalid||t.setValue(n.join(`
`)),new u.Notice("Use one safe vault-relative folder per line, or leave the field blank.");return}this.plugin.settings.excludedVaultFolders=a,this.plugin.excludedVaultFoldersPersistedInvalid=!1,this.plugin.excludedVaultFoldersInput=void 0,t.setValue(a.join(`
`));try{await this.plugin.saveSettings()}catch(o){this.plugin.settings.excludedVaultFolders=n,this.plugin.excludedVaultFoldersPersistedInvalid=i,this.plugin.excludedVaultFoldersInput=r,t.setValue(i?r??"":n.join(`
`)),new u.Notice(`Could not save excluded folders: ${o instanceof Error?o.message:String(o)}`)}}};
