"use strict";var W=Object.defineProperty;var _e=Object.getOwnPropertyDescriptor;var We=Object.getOwnPropertyNames;var Ue=Object.prototype.hasOwnProperty;var Ke=(e,t)=>{for(var n in t)W(e,n,{get:t[n],enumerable:!0})},je=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of We(t))!Ue.call(e,i)&&i!==n&&W(e,i,{get:()=>t[i],enumerable:!(r=_e(t,i))||r.enumerable});return e};var Ge=e=>je(W({},"__esModule",{value:!0}),e);var Qt={};Ke(Qt,{default:()=>Y});module.exports=Ge(Qt);var u=require("obsidian");var ue=require("node:child_process"),ge=require("node:util");var m=class extends Error{constructor(t){super(t),this.name="CalendarPayloadValidationError"}};function A(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function D(e,t){if(typeof e!="string")throw new m(`${t} must be a string`);return e}function N(e,t){if(e!==null&&typeof e!="string")throw new m(`${t} must be a string or null`);return e}function M(e,t){let n=D(e,t);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(n)||Number.isNaN(Date.parse(n)))throw new m(`${t} must be a valid ISO date`);return n}function U(e){let t=D(e,"targetDate");if(!/^\d{4}-\d{2}-\d{2}$/.test(t))throw new m("targetDate must be YYYY-MM-DD");let[n,r,i]=t.split("-").map(Number),a=new Date(Date.UTC(n,r-1,i));if(a.getUTCFullYear()!==n||a.getUTCMonth()!==r-1||a.getUTCDate()!==i)throw new m("targetDate must be a valid calendar date");return t}function Ze(e){return/^(?:EventKit|Some EventKit) (?:calendar|event URL|event title|attendee|attendee display name|attendee email|attendee status) data is unavailable on this macOS\/source\.$/.test(e)}var Je=new Set(["unknown","pending","accepted","declined","tentative","delegated","completed","in-process"]);function qe(e,t){let n=D(e,`attendee ${t} status`);if(!Je.has(n))throw new m(`attendee ${t} status is not a stable EventKit status`);return n}function Qe(e,t){if(!A(e))throw new m(`events attendee ${t} must be an object`);return{displayName:N(e.displayName,`attendee ${t} displayName`),email:N(e.email,`attendee ${t} email`),status:qe(e.status,t)}}function Xe(e,t){if(!A(e))throw new m(`event ${t} must be an object`);let n=e.attendees;if(!Array.isArray(n))throw new m(`event ${t} attendees must be an array`);let r=M(e.start,`event ${t} start`),i=M(e.end,`event ${t} end`);if(Date.parse(i)<Date.parse(r))throw new m(`event ${t} end cannot precede start`);if(typeof e.allDay!="boolean")throw new m(`event ${t} allDay must be a boolean`);return{id:N(e.id,`event ${t} id`),calendar:N(e.calendar,`event ${t} calendar`),title:D(e.title,`event ${t} title`),start:r,end:i,allDay:e.allDay,url:N(e.url,`event ${t} url`),location:N(e.location,`event ${t} location`),notes:e.notes===null?null:(()=>{throw new m(`event ${t} notes must be null`)})(),attendees:n.map((a,o)=>Qe(a,o))}}function de(e){let t;try{t=JSON.parse(e)}catch{throw new m("Calendar bridge output was not valid JSON")}return et(t)}function et(e){if(!A(e))throw new m("Calendar bridge output must be a JSON object");if(e.schemaVersion!==1)throw new m("Calendar bridge output has an unsupported schema version");if(!A(e.range))throw new m("Calendar bridge output range must be an object");let t=M(e.range.start,"range start"),n=M(e.range.end,"range end");if(Date.parse(n)<=Date.parse(t))throw new m("range end must be after range start");let r=D(e.range.timeZone,"range timeZone").trim();if(!r)throw new m("range timeZone cannot be empty");if(!Array.isArray(e.events))throw new m("Calendar bridge output events must be an array");if(!Array.isArray(e.warnings)||e.warnings.some(a=>typeof a!="string"))throw new m("Calendar bridge output warnings must be an array of strings");let i=e.warnings;return{schemaVersion:1,source:D(e.source,"source"),targetDate:U(e.targetDate),range:{start:t,end:n,timeZone:r},events:e.events.map((a,o)=>Xe(a,o)),warnings:i.map(a=>{if(!Ze(a))throw new m("Calendar bridge warnings may only describe unavailable optional EventKit data");return a})}}var ce=`/*
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
`;var tt=(0,ge.promisify)(ue.execFile),nt=async(e,t,n)=>await tt(e,t,n),w=class extends Error{constructor(t,n=!1){super(t),this.name="CalendarBridgeError",this.isPermissionFailure=n}},rt=/\bEVENTKIT_PERMISSION_(?:DENIED|RESTRICTED|WRITE_ONLY|REQUEST_TIMEOUT|UNAVAILABLE)\b/;function E(e){return typeof e!="string"?"":e.replace(/[\u0000-\u001f\u007f-\u009f]/gu," ").replace(/\s+/gu," ").trim().slice(0,500)}function G(e){return(typeof e=="string"?e.match(rt):null)?.[0]??null}function K(e){return`EventKit Calendar permission failed (${e}). Allow Calendar access in System Settings \u2192 Privacy & Security \u2192 Calendars, then try again.`}function j(e){return`EventKit bridge failed: ${e||"no diagnostic details were returned."}`}function it(e){let t=e,n=E(t?.stderr),r=E(t?.message);return{details:n||r,code:G(`${n} ${r}`)}}async function me(e,t=nt){try{U(e)}catch(i){throw new w(i instanceof Error?i.message:"Calendar target date must be YYYY-MM-DD.")}let n;try{n=await t("/usr/bin/osascript",["-l","JavaScript","-e",ce,e],{encoding:"utf8",timeout:3e4,maxBuffer:2*1024*1024,shell:!1,windowsHide:!0})}catch(i){let a=it(i);throw a.code?new w(K(a.code),!0):new w(j(a.details))}let r=n.stdout.trim();if(!r){let i=E(n.stderr),a=G(n.stderr);throw a?new w(K(a),!0):new w(j(i))}try{let i=de(r);if(i.targetDate!==e)throw new Error(`Calendar bridge returned ${i.targetDate} instead of ${e}.`);return i}catch(i){let a=E(i instanceof Error?i.message:String(i)),o=E(n.stderr),s=G(`${o} ${a}`);throw s?new w(K(s),!0):new w(j([o,a].filter(Boolean).join(" | ")))}}function at(){return{byEmail:new Map,byName:new Map}}function pe(e,t){return e?t():at()}function Z(e,t,n){if(!t)return;let r=e.get(t)??[];r.some(i=>i.path===n.path)||(r.push(n),r.sort((i,a)=>i.path.localeCompare(a.path))),e.set(t,r)}function L(e){return e.normalize("NFKC").toLowerCase().replaceAll("\u03C2","\u03C3")}function b(e){return L(e).trim().replace(/\s+/gu," ")}function $(e){return L(e).trim().replace(/\s+/gu,"")}function J(e,t){let n=e?.[t];return typeof n=="string"?[n]:Array.isArray(n)?n.filter(r=>typeof r=="string"):[]}function ot(e){let t=e.path.replaceAll("\\","/"),n=e.basename||t.split("/").at(-1)?.replace(/\.md$/i,"")||"";return{path:t,basename:n,file:e.file}}function st(e,t){let n=e.replaceAll("\\","/");return t.some(r=>{let i=r.replaceAll("\\","/").replace(/\/+$/u,"");return n===i||n.startsWith(`${i}/`)})}function fe(e,t){let n=new Map,r=new Map;for(let i of e){let a=i.path.replaceAll("\\","/");if(!a.toLowerCase().endsWith(".md")||st(a,t))continue;let o=ot(i);Z(r,b(o.basename),o);for(let s of J(i.frontmatter,"aliases"))Z(r,b(s),o);for(let s of[...J(i.frontmatter,"email"),...J(i.frontmatter,"emails")])Z(n,$(s),o)}return{byEmail:n,byName:r}}function he(e,t){let n=t.email?$(t.email):"";if(n){let a=e.byEmail.get(n);if(a?.length===1)return a[0];if(a&&a.length>1)return null}let r=t.displayName?b(t.displayName):"";if(!r)return null;let i=e.byName.get(r);return i?.length===1?i[0]:null}function ye(e,t){let n=new Map,r=(a,o)=>{if(!o||typeof o.linkText!="string")throw new Error(`Vault note link data is invalid for ${a.path}.`);if(!o.linkText.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(o.linkText)||o.linkText.includes("<!-- calendar-daily-note-linker:start -->")||o.linkText.includes("<!-- calendar-daily-note-linker:end -->"))throw new Error(`Vault note link data is unsafe for ${a.path}.`);return{linkText:o.linkText}},i=a=>a.map(o=>{let s=n.get(o.path);return s===void 0&&(s=r(o,t(o)),n.set(o.path,s)),{...o,...s}});return{byEmail:new Map([...e.byEmail].map(([a,o])=>[a,i(o)])),byName:new Map([...e.byName].map(([a,o])=>[a,i(o)]))}}function lt(e){return/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(e)}function dt(e){return!e||/[\r\n\u2028\u2029]/u.test(e)||lt(e)?!1:/^#{1,6}[ \t]+\S(?:.*)$/u.test(e.trim())}function ct(e){let t=/^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(e);if(!t)return null;let n=t[2];return{character:n[0],length:n.length}}function ut(e,t){return new RegExp(`^ {0,3}${t.character}{${t.length},}[ \\t]*$`,"u").test(e)}function q(e){let t=e.split(`
`),n=[],r=0,i=t.length>0&&t[0].replace(/^\ufeff/u,"").trim()==="---",a=null;for(let o of t){let s=o.endsWith("\r")?o.slice(0,-1):o,l=r+s.length;if(i){r!==0&&(s.trim()==="---"||s.trim()==="...")&&(i=!1),r+=o.length+1;continue}if(a){ut(s,a)&&(a=null),r+=o.length+1;continue}let d=ct(s);if(d){let g=s.replace(/^ {0,3}(`{3,}|~{3,})/u,"");(d.character==="~"||!g.includes("`"))&&(a=d),r+=o.length+1;continue}if(/^(?: {4}|\t)/u.test(s)){r+=o.length+1;continue}let c=s.trim();dt(c)&&n.push({text:c,start:r,contentEnd:l}),r+=o.length+1}return n}var F="<!-- calendar-daily-note-linker:start -->",R="<!-- calendar-daily-note-linker:end -->",Q="## Calendar",f=class extends Error{constructor(t){super(t),this.name="CalendarBlockError"}};function X(e){return[Q,...e.map(xe)].join(`
`)}function ve(e){let t=gt(e),n=ft(e),r=n.filter(g=>g.text==="# Notes");if(r.length!==1)throw new f("The # Notes heading was not found exactly once.");let i=r[0],o=n.find(g=>g.start>i.start&&g.level===1)?.start??e.length,s=n.filter(g=>g.text===Q).filter(g=>!t||!be(g.start,t));if(s.length>1)throw new f("The Calendar section is duplicated.");let l=s[0],d=l?ht(e,l,n,t):null,c=t&&l&&d&&yt(e,t,l,d)?d:null;if(t&&d&&vt(t,d)&&!c)throw new f("The legacy Calendar block is inside a non-empty Calendar section.");if(l&&!c&&(l.start<i.contentEnd||l.start>=o))throw new f("The Calendar section is outside the # Notes section.");return{newline:e.includes(`\r
`)?`\r
`:`
`,notes:i,notesEnd:o,markerRange:t,calendarSectionRange:d,legacyWrapperRange:c,kind:t?"legacy-marker":l?"visible-section":"new-section"}}function Ce(e,t){mt(t);let n=ve(e);if(n.kind==="visible-section"){if(!n.calendarSectionRange)throw new f("The Calendar section boundary could not be determined.");return Ne(e,n.calendarSectionRange,t,n.newline)}if(n.kind==="legacy-marker"){if(!n.markerRange)throw new f("The legacy Calendar block range could not be determined.");let r=ke(e,n.markerRange),i=n.legacyWrapperRange?ke(r,wt(n.legacyWrapperRange,n.markerRange)):r,a=ve(i);return we(i,a,t,e.endsWith(`
`))}return we(e,n,t,e.endsWith(`
`))}function gt(e){let t=bt(e),n=[],r=[],i=t.length>0&&t[0].content.replace(/^\ufeff/u,"").trim()==="---",a=null;for(let o of t){if(i){o.start!==0&&(o.content.trim()==="---"||o.content.trim()==="...")&&(i=!1);continue}if(a){xt(o.content,a)&&(a=null);continue}let s=Ct(o.content);if(s){let g=o.content.replace(/^ {0,3}(`{3,}|~{3,})/u,"");(s.character==="~"||!g.includes("`"))&&(a=s);continue}let l=o.content===F,d=o.content===R;if((o.content.includes(F)||o.content.includes(R))&&!l&&!d)throw new f("The Calendar section marker must be on an exact standalone line.");/^(?: {4}|\t)/u.test(o.content)||(l&&n.push(o),d&&r.push(o))}if(n.length===0&&r.length===0)return null;if(n.length!==1||r.length!==1||n[0].start>=r[0].start)throw new f("The Calendar section markers are duplicated, incomplete, or out of order.");return{start:n[0].start,end:r[0].next}}function mt(e){let t=e.split(`
`).map(n=>n.endsWith("\r")?n.slice(0,-1):n);if(t[0]!==Q)throw new f("Generated Calendar content must start with the ## Calendar heading.");if(t.some(n=>n.includes(F)||n.includes(R)))throw new f("Generated Calendar content must not contain legacy section markers.");if(t.slice(1).some(n=>/^\s{0,3}#{1,2}[ \t]+\S/u.test(n)))throw new f("Generated Calendar events must use Heading 3 through Heading 6.")}function xe(e){return e.replace(/\r\n?|\n|\u2028|\u2029/gu," ").replace(/[\u0000-\u001f\u007f-\u009f]/gu,"").replaceAll(F,"[calendar section start]").replaceAll(R,"[calendar section end]")}function ee(e){return xe(e).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replace(/[\\`*_{}\[\]()#+\-.!|>~]/gu,"\\$&")}function pt(e){return e.match(/^#+/u)?.[0].length??0}function ft(e){return q(e).map(t=>({...t,end:t.contentEnd,level:pt(t.text)}))}function ht(e,t,n,r=null){let i=n.find(a=>a.start>t.start&&a.level<=2&&(!r||!be(a.start,r)));return{start:t.start,end:i?.start??e.length}}function yt(e,t,n,r){return t.start<n.contentEnd||t.end>r.end?!1:/^\s*$/u.test(e.slice(n.contentEnd,t.start))&&/^\s*$/u.test(e.slice(t.end,r.end))}function vt(e,t){return e.start<t.end&&t.start<e.end}function be(e,t){return e>=t.start&&e<t.end}function wt(e,t){let n=t.end-t.start;return{start:e.start<=t.start?e.start:e.start-n,end:e.end<=t.start?e.end:e.end-n}}function we(e,t,n,r){if(t.kind==="visible-section"){if(!t.calendarSectionRange)throw new f("The Calendar section boundary could not be determined.");return Ne(e,t.calendarSectionRange,n,t.newline)}if(t.kind==="new-section")return kt(e,t,n,t.newline,r);throw new f("The legacy Calendar block could not be migrated safely.")}function Ne(e,t,n,r){let i=e.slice(t.start,t.end),a=De(n,r)+(i.endsWith(`
`)?r:"");return`${e.slice(0,t.start)}${a}${e.slice(t.end)}`}function kt(e,t,n,r,i){let a=e.slice(0,t.notesEnd),o=e.slice(t.notesEnd),s=a.endsWith(`
`)?"":r,l=o.length>0||i?r:"";return`${a}${s}${De(n,r)}${l}${o}`}function De(e,t){return e.replace(/\r\n?|\n/gu,t)}function ke(e,t){return`${e.slice(0,t.start)}${e.slice(t.end)}`}function Ct(e){let t=/^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(e);if(!t)return null;let n=t[2];return{character:n[0],length:n.length}}function xt(e,t){return new RegExp(`^ {0,3}${t.character}{${t.length},}[ \\t]*$`,"u").test(e)}function bt(e){let t=e.split(`
`),n=[],r=0;for(let i of t){let a=i.endsWith("\r")?i.slice(0,-1):i,o=r+i.length;n.push({content:a,start:r,end:o,next:Math.min(e.length,o+1)}),r=o+1}return n}var Nt={eventHeadingLevel:3,timeFormat:"24-hour",linkMatchingVaultNotes:!0,linkEventTitles:!0};function Pe(e){return e.replaceAll("\\","\\\\").replace(/[\s<>]/gu,t=>encodeURIComponent(t)).replaceAll("(","\\(").replaceAll(")","\\)").replaceAll('"',"%22")}function te(e){if(!e?.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(e)||e.includes("<!-- calendar-daily-note-linker:start -->")||e.includes("<!-- calendar-daily-note-linker:end -->"))return null;try{let t=new URL(e.trim());return t.protocol==="http:"||t.protocol==="https:"?t.href:null}catch{return null}}function Ae(e,t){if(e.allDay!==t.allDay)return e.allDay?-1:1;let n=Date.parse(e.start)-Date.parse(t.start);if(n!==0)return n;let r=Date.parse(e.end)-Date.parse(t.end);return r!==0?r:e.title.localeCompare(t.title)}function Dt(e){let t=[...new Set(e.attendees.map(n=>JSON.stringify([$(n.email??""),b(n.displayName??"")])))].sort();return JSON.stringify([b(e.title),e.start,e.end,e.allDay,te(e.url)??"",t])}function Me(e){let t=new Set,n=[];for(let r of e){let i=Dt(r);t.has(i)||(t.add(i),n.push(r))}return n}function I(e,t,n="24-hour"){let r={timeZone:t,hour:"numeric",minute:"2-digit",hour12:n==="12-hour",...n==="24-hour"?{hourCycle:"h23"}:{}};try{return new Intl.DateTimeFormat("en-US",r).format(new Date(e))}catch{return new Intl.DateTimeFormat("en-US",{...r,timeZone:void 0}).format(new Date(e))}}function Pt(e){return ee(e).replaceAll("\\-","-")}function Et(e){let t=Intl.Segmenter;if(t)return[...new t(void 0,{granularity:"grapheme"}).segment(e)];let n=[],r=0;for(let i of e){let a=r;r+=i.length;let o=i;for(;r<e.length;){let s=e.codePointAt(r);if(s===void 0)break;let l=String.fromCodePoint(s);if(!/[\p{M}\u200d\ufe0e\ufe0f]/u.test(l)&&!o.endsWith("\u200D"))break;o+=l,r+=l.length}n.push({index:a,segment:o})}return n}function Tt(e){let t=[],n=[],r=[],i,a,o=(s,l,d)=>{t.push(s);for(let c=0;c<s.length;c+=1)n.push(l),r.push(d)};for(let s of Et(e)){let l=L(s.segment),d=s.index+s.segment.length;if(/^\s+$/u.test(l)){i??(i=s.index),a=d;continue}t.length>0&&i!==void 0&&a!==void 0&&o(" ",i,a),i=void 0,a=void 0,o(l,s.index,d)}return{value:t.join(""),starts:n,ends:r}}function Ee(e){return e!==void 0&&/[\p{L}\p{N}\p{M}_]/u.test(e)}function St(e,t){if(t<=0)return;let n=t-1,r=e.charCodeAt(n);r>=56320&&r<=57343&&n>0&&(n-=1);let i=e.codePointAt(n);return i===void 0?void 0:String.fromCodePoint(i)}function At(e,t){let n=e.codePointAt(t);return n===void 0?void 0:String.fromCodePoint(n)}var Mt=new Set(["a","an","and","at","by","dr","for","from","in","mr","mrs","ms","of","on","or","prof","the","to","with"]);function Te(e){let t=e?b(e):"";if(!t||t.includes(","))return null;let n=t.match(/[\p{L}\p{N}\p{M}]+(?:['-][\p{L}\p{N}\p{M}]+)*/u)?.[0]??"";return!n||[...n].length<2||/^\p{N}+$/u.test(n)||Mt.has(n)?null:n}function Se(e,t){let n=t?b(t):"";n&&!e.fullNames.includes(n)&&e.fullNames.push(n)}function Lt(e,t){let n=new Map;for(let i of t){let a=he(e,i);if(!a||!a.linkText)continue;let o=n.get(a.path)??{target:a,fullNames:[],shortName:null};Se(o,i.displayName),Se(o,o.target.basename),o.shortName??(o.shortName=Te(i.displayName)??Te(o.target.basename)),n.set(a.path,o)}let r=new Map;for(let i of n.values()){let a=i.shortName?[...i.fullNames,i.shortName]:i.fullNames;for(let o of a){let s=r.get(o)??new Set;s.add(i.target.path),r.set(o,s)}}return[...n.values()].map(i=>{let a=i.fullNames.filter(o=>r.get(o)?.size===1);return i.shortName&&r.get(i.shortName)?.size===1&&!a.includes(i.shortName)&&a.push(i.shortName),{target:i.target,names:a}})}function $t(e,t){if(!t.some(a=>a.names.length>0&&!!a.target.linkText))return[];let n=Tt(e),r=[];for(let a of t)if(a.target.linkText)for(let o of a.names){let s=0;for(;s<n.value.length;){let l=n.value.indexOf(o,s);if(l<0)break;let d=l+o.length;if(!Ee(St(n.value,l))&&!Ee(At(n.value,d))){let c=n.starts[l],g=n.ends[l];for(let y=l+1;y<d;y+=1)c=Math.min(c,n.starts[y]),g=Math.max(g,n.ends[y]);r.push({start:c,end:g,normalizedLength:o.length,target:a.target})}s=l+1}}r.sort((a,o)=>a.normalizedLength!==o.normalizedLength?o.normalizedLength-a.normalizedLength:a.start!==o.start?a.start-o.start:o.end-a.end);let i=[];for(let a of r)i.some(o=>a.start<o.end&&o.start<a.end)||i.push(a);return i.sort((a,o)=>a.start-o.start)}function Ft(e){return e.replaceAll("<!-- calendar-daily-note-linker:start -->","[calendar section start]").replaceAll("<!-- calendar-daily-note-linker:end -->","[calendar section end]").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu,"").replaceAll("\\","\\\\").replaceAll("|","\\|").replaceAll("]","\\]")}function Rt(e,t,n){return e.linkText?`[[${Ft(e.linkText)}|${n(t)}]]`:null}function It(e,t,n){let r=$t(e,t),i="",a=0,o=0;for(let s of r){let l=Rt(s.target,e.slice(s.start,s.end),n);l&&(i+=n(e.slice(a,s.start)),i+=l,a=s.end,o+=1)}return i+=n(e.slice(a)),{title:i,linkCount:o}}function Le(e,t,n,r){return n?It(e.title,Lt(t,e.attendees),r):{title:r(e.title),linkCount:0}}function $e(e,t){if(!t)return e.title;let n=`[Calendar](${Pe(t)})`;return e.linkCount>0?`${e.title} \xB7 ${n}`:`[${e.title}](${Pe(t)})`}function Vt(e,t,n,r){let i=r.linkEventTitles?te(e.url):null,a=Le(e,n,r.linkMatchingVaultNotes,Pt),o=$e(a,i),s=Math.min(6,Math.max(3,r.eventHeadingLevel)),l=`${"#".repeat(s)} ${o}`,d=e.allDay?"All day":`${I(e.start,t.range.timeZone,r.timeFormat)} \u2013 ${I(e.end,t.range.timeZone,r.timeFormat)}`;return{lines:[l,d],linkCount:a.linkCount}}function Ht(e,t,n){let r=[],i=Me(e.events).sort(Ae),a=0;if(!i.length)r.push(`No Calendar events found for ${e.targetDate}.`);else for(let o of i){let s=Vt(o,e,t,n);r.push(...s.lines),a+=s.linkCount}return{block:X(r),eventCount:i.length,linkCount:a}}function zt(e,t,n){let r=[],i=Me(e.events).sort(Ae),a=0;if(!i.length)r.push(`No Calendar events found for ${e.targetDate}.`);else for(let o of i){let s=te(o.url),l=Le(o,n,!0,ee),d=$e(l,s),c=o.allDay?"All day":`${I(o.start,e.range.timeZone,"12-hour")}\u2013${I(o.end,e.range.timeZone,"12-hour")}`;r.push(`### ${d}`),r.push(c),a+=l.linkCount}return{block:X(r),eventCount:i.length,linkCount:a}}function Fe(e,t,n){return typeof t=="string"?zt(e,t,n):Ht(e,t,{...Nt,...n})}var x={excludedVaultFolders:[],insertionMode:"heading",insertionHeading:"# Notes",eventHeadingLevel:3,timeFormat:"24-hour",linkMatchingVaultNotes:!0,linkEventTitles:!0},ne=class extends Error{constructor(){super("Vault folder exclusions are malformed. Correct them in settings before importing Calendar events."),this.name="ExcludedVaultFolderError"}};function Yt(e){let t=e.replaceAll("\\","/"),n=t.split("/");if(!(!t||t.startsWith("/")||/^[A-Za-z]:/.test(t)||n.some(r=>r.length===0||r==="."||r===".."||r.includes("\0"))))return t}function V(e){let t=Array.isArray(e),n=typeof e=="string"?e.split(/\r\n?|\n|\u2028|\u2029/gu):t&&e.every(i=>typeof i=="string")?e:void 0;if(!n)return;let r=[];for(let i of n){if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(i))return;if(!i.trim())continue;let a=Yt(i);if(!a)return;r.includes(a)||r.push(a)}return r}function Re(e){if(e===void 0)return x.excludedVaultFolders;let t=V(e);if(!t)throw new ne;return t}function Ot(e){if(e===void 0)return{folders:[],malformed:!1};let t=V(e);return t?{folders:t,malformed:!1}:{folders:[],malformed:!0,rawInput:typeof e=="string"?e:Array.isArray(e)?e.map(String).join(`
`):String(e)}}function H(e){let t=typeof e=="string"&&/^\d+$/u.test(e)?Number(e):e;return t===2?3:t===3||t===4||t===5||t===6?t:void 0}function Bt(e){return H(e)??x.eventHeadingLevel}function z(e){return e==="24-hour"||e==="12-hour"?e:void 0}function _t(e){return z(e)??x.timeFormat}function T(e,t){return typeof e=="boolean"?e:t}function Ie(e){let t=typeof e=="object"&&e!==null&&!Array.isArray(e)?e:{};return{excludedVaultFolders:Ot(t.excludedVaultFolders),insertionMode:"heading",insertionHeading:"# Notes",eventHeadingLevel:Bt(t.eventHeadingLevel),timeFormat:_t(t.timeFormat),linkMatchingVaultNotes:T(t.linkMatchingVaultNotes,x.linkMatchingVaultNotes),linkEventTitles:T(t.linkEventTitles,x.linkEventTitles)}}var p=class extends Error{constructor(t){super(t),this.name="ActiveDailyNoteError"}};function Wt(e){return(e??"").replaceAll("\\","/").replace(/\/+$/u,"")}function Ut(e){let t=[],n=0;for(;n<e.length;){if(e[n]==="\\"){n+=2;continue}if(e[n]==="["){let r=e.indexOf("]",n+1);n=r===-1?e.length:r+1;continue}if(/[YMD]/u.test(e[n])){let r=n,i=e[n];for(;n<e.length&&e[n]===i&&n-r<5;)n+=1;t.push({token:e.slice(r,n),start:r,end:n});continue}n+=1}return t}function Kt(e){if(typeof e!="string"||!e)return!1;let t=Ut(e),n=t.filter(({token:s})=>s.startsWith("D")),r=n.some(({token:s})=>s.length>=3),i=n.some(({token:s})=>s.length<=2),a=t.some(({token:s})=>s.startsWith("M"));return!t.some(({token:s})=>s.startsWith("Y"))||!(r||a&&i)?!1:t.some(({token:s})=>s==="YYYY")}function jt(e,t){let n=e.replaceAll("\\","/"),r=t?`${t}/`:"";if(t&&!n.startsWith(r))throw new p("The active note is outside the configured core Daily Notes folder.");let i=n.slice(r.length);if(!i.endsWith(".md"))throw new p("The active note must be a Markdown Daily Note.");return i.slice(0,-3)}function Ve(e,t,n,r,i){if(e.extension.toLowerCase()!=="md")throw new p("Open an existing configured Daily Note before running this command.");if(!Kt(t.format))throw new p("The core Daily Notes filename format cannot identify one calendar date.");let a=Wt(t.folder),o=t.format,s=jt(e.path,a),l=n(s,o,!0);if(!l?.isValid()||l.format(o)!==s){if(!i)throw new p("The active note path is not the canonical core Daily Note for one date.");let g=n(s,o,!1);if(!g?.isValid())throw new p("The active note path is not the canonical core Daily Note for one date.");let y=He(s,o,g.format("YYYY-MM-DD"),i);if(y.length!==1)throw new p("The active note path can represent more than one calendar date.");l=y[0]}let d=`${a?`${a}/`:""}${l.format(o)}.md`;if(e.path.replaceAll("\\","/")!==d)throw new p("The active note path is not the canonical core Daily Note path.");if(!i||Zt(s,o,l,i))throw new p("The active note path can represent more than one calendar date.");if(r&&!o.includes("/")){let g=r(e,"day");if(g?.isValid()&&g.format("YYYY-MM-DD")!==l.format("YYYY-MM-DD"))throw new p("The active note date could not be confirmed by core Daily Notes.")}let c=l.format("YYYY-MM-DD");if(!/^\d{4}-\d{2}-\d{2}$/u.test(c))throw new p("The active note did not resolve to one calendar date.");return c}function Gt(e,t){let n=new Date(Date.UTC(e,0,1+t));return`${String(n.getUTCFullYear()).padStart(4,"0")}-${String(n.getUTCMonth()+1).padStart(2,"0")}-${String(n.getUTCDate()).padStart(2,"0")}`}function He(e,t,n,r){let i=Number(n.slice(0,4)),a=[],o=[i-100,i-1,i,i+1,i+100];for(let s of o){let l=new Date(Date.UTC(s,1,29)).getUTCDate()===29?366:365;for(let d=0;d<l;d+=1){let c=r(Gt(s,d));c?.isValid()&&c.format(t)===e&&a.push(c)}}return a}function Zt(e,t,n,r){let i=n.format("YYYY-MM-DD");return He(e,t,i,r).some(o=>o.format("YYYY-MM-DD")!==i)}function ze(e,t,n,r,i,a){if(!t||t!==e||t.path!==e.path||t.basename!==e.basename)throw new p("The active Daily Note changed, moved, or was deleted; import aborted before writing.");if((n.folder??"")!==(r.folder??"")||(n.format??"")!==(r.format??"")||(n.template??"")!==(r.template??"")||i!==a)throw new p("The active Daily Note or core Daily Notes configuration changed; import aborted before writing.")}function Jt(e){return"under # Notes"}function qt(e){let t=[e.linkMatchingVaultNotes?"attendee-name links on (title names only)":"attendee-name links off",e.linkEventTitles?"Calendar URL links on (separate when needed)":"Calendar URL links off"];return`Heading ${e.eventHeadingLevel}, ${e.timeFormat}, ${t.join(", ")}`}function Ye(e,t,n,r,i){if(!i){if(n===0)return`No Calendar events found for ${e}. The active Daily Note was updated.`;let d=n===1?"event":"events";return r===0?`Imported ${n} Calendar ${d} into ${t}. No uniquely matched attendee names appeared in event titles.`:`Imported ${n} Calendar ${d} into ${t} and added ${r} vault ${r===1?"link":"links"} for attendee names present in event titles.`}let a=`${Jt(i)}; ${qt(i)}; visible Calendar section updated`;if(n===0)return`No Calendar events found for ${e}; updated ${t} (${a}).`;let o=n===1?"event":"events",l=r===0?i.linkMatchingVaultNotes?"No uniquely matched attendee names appeared in event titles.":"Attendee-name matching links are disabled.":`Added ${r} vault ${r===1?"link":"links"} for attendee names present in event titles.`;return`Imported ${n} Calendar ${o} into ${t} (${a}). ${l}`}var h=class extends Error{constructor(t,n){super(n),this.name="DailyNoteProviderCompatibilityError",this.kind=t}},P=class extends Error{constructor(t){super(t),this.name="DailyNoteProviderError"}};function C(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function re(e,t,n,r){let i=e[t];if(i===void 0)return n;if(typeof i!="string")throw new h(r,`${r==="core"?"Core Daily Notes":"Periodic Notes"} ${t} setting has an unsupported shape.`);return t==="format"&&i.trim()===""?n:t==="folder"||t==="template"?i.trim():i}function Oe(e,t){return{folder:re(e,"folder","",t),format:re(e,"format","YYYY-MM-DD",t),template:re(e,"template","",t)}}function ie(e){if(!C(e))return{candidates:[],errors:[new h("core","Core Daily Notes provider shape is unavailable.")]};let t=[],n=[];try{let i=(C(e.internalPlugins)&&C(e.internalPlugins.plugins)?e.internalPlugins.plugins:void 0)?.["daily-notes"];if(C(i)&&i.enabled===!0)if(!C(i.instance)||!C(i.instance.options))n.push(new h("core","Core Daily Notes settings/options are unavailable or unsupported."));else try{t.push({kind:"core",settings:Oe(i.instance.options,"core")})}catch(a){a instanceof h?n.push(a):n.push(new h("core","Core Daily Notes settings could not be read safely."))}}catch{n.push(new h("core","Core Daily Notes provider shape is unavailable or unsupported."))}try{let r=C(e.plugins)?e.plugins:void 0,i=r&&typeof r.getPlugin=="function"?r.getPlugin.bind(r):void 0;if(!i)return{candidates:t,errors:[...n,new h("periodic","Periodic Notes provider shape is unavailable or unsupported.")]};let a=i?.("periodic-notes");if(a!==void 0){if(!C(a)||!C(a.settings)||!C(a.settings.daily))n.push(new h("periodic","Periodic Notes daily settings are unavailable or unsupported."));else if(a.settings.daily.enabled===!0)try{t.push({kind:"periodic",settings:Oe(a.settings.daily,"periodic")})}catch(o){o instanceof h?n.push(o):n.push(new h("periodic","Periodic Notes daily settings could not be read safely."))}}}catch{n.push(new h("periodic","Periodic Notes provider shape is unavailable or unsupported."))}return{candidates:t,errors:n}}function ae(e,t,n,r,i=[]){let a=[];for(let s of t)try{let l=Ve(e,s.settings,n,void 0,r);a.push({...s,targetDate:l})}catch{}if(!a.length){let s=i.length?` ${i.map(l=>l.message).join(" ")}`:"";throw new P(`The active note does not match configured Daily Notes or Periodic Notes settings.${s} Open a configured Daily Note or check those settings.`)}if(new Set(a.map(s=>s.targetDate)).size>1)throw new P("The active note matches multiple Daily Notes configurations with different dates; import is ambiguous.");return a.find(s=>s.kind==="core")??a[0]}function Be(e,t){if(e.kind!==t.kind||e.targetDate!==t.targetDate||(e.settings.folder??"")!==(t.settings.folder??"")||(e.settings.format??"")!==(t.settings.format??"")||(e.settings.template??"")!==(t.settings.template??""))throw new p("The Daily Note provider or configuration changed; import aborted before writing.")}var S=class extends Error{constructor(t){super(t),this.name="CalendarInsertionError"}};function oe(e,t){try{return Ce(e,t)}catch(n){throw n instanceof f?new S(`${n.message}; import aborted without changing the note.`):n}}var Y=class extends u.Plugin{constructor(){super(...arguments);this.settings={...x};this.excludedVaultFoldersPersistedInvalid=!1}async onload(){await this.loadSettings(),this.addCommand({id:"import-calendar-events-into-active-daily-note",name:"Import Calendar events into active Daily Note",callback:()=>{this.importIntoActiveDailyNote()}}),this.addSettingTab(new se(this.app,this))}async loadSettings(){let n=await this.loadData(),r=Ie(n);this.excludedVaultFoldersPersistedInvalid=r.excludedVaultFolders.malformed,this.excludedVaultFoldersInput=r.excludedVaultFolders.rawInput,this.settings={excludedVaultFolders:r.excludedVaultFolders.folders,insertionMode:r.insertionMode,insertionHeading:r.insertionHeading,eventHeadingLevel:r.eventHeadingLevel,timeFormat:r.timeFormat,linkMatchingVaultNotes:r.linkMatchingVaultNotes,linkEventTitles:r.linkEventTitles}}async saveSettings(){let n=Re(this.settings.excludedVaultFolders),r=H(this.settings.eventHeadingLevel);if(!r)throw new Error("Event heading level must be Heading 3 through Heading 6.");let i=z(this.settings.timeFormat);if(!i)throw new Error("Time format must be 24-hour or 12-hour.");if(typeof this.settings.linkMatchingVaultNotes!="boolean"||typeof this.settings.linkEventTitles!="boolean")throw new Error("Linking settings must be enabled or disabled.");this.settings={excludedVaultFolders:n,insertionMode:"heading",insertionHeading:"# Notes",eventHeadingLevel:r,timeFormat:i,linkMatchingVaultNotes:T(this.settings.linkMatchingVaultNotes,x.linkMatchingVaultNotes),linkEventTitles:T(this.settings.linkEventTitles,x.linkEventTitles)};let a=this.excludedVaultFoldersPersistedInvalid?{...this.settings,excludedVaultFolders:this.excludedVaultFoldersInput??""}:this.settings;await this.saveData(a)}activeMarkdownEditor(n){let r=this.app.workspace.getActiveViewOfType(u.MarkdownView);return!r?.editor||!r.file||r.file.path!==n.path?null:r.editor}replaceEditorContent(n,r,i){if(r===i)return;let a=0;for(;a<r.length&&a<i.length&&r[a]===i[a];)a+=1;let o=0;for(;o<r.length-a&&o<i.length-a&&r[r.length-o-1]===i[i.length-o-1];)o+=1;let s=n.offsetToPos(a),l=n.offsetToPos(r.length-o);n.replaceRange(i.slice(a,i.length-o),s,l,"calendar-daily-note-linker")}async importIntoActiveDailyNote(){let n=new u.Notice("Checking the active Daily Note\u2026",0),r=i=>{n.setMessage(i),window.setTimeout(()=>n.hide(),1e4)};try{if(process.platform!=="darwin")throw new Error("Calendar Daily Note Linker requires macOS desktop and Calendar access.");let i=this.app.workspace.getActiveFile();if(!i||i.extension.toLowerCase()!=="md")throw new p("Open an existing configured Daily Note before running this command.");if(this.settings.linkMatchingVaultNotes&&this.excludedVaultFoldersPersistedInvalid)throw new Error("Saved vault folder exclusions are invalid. Correct them in settings before importing Calendar events.");let a=(k,v)=>(0,u.moment)(k,v,!0),o=k=>(0,u.moment)(k,"YYYY-MM-DD",!0),s=ie(this.app),l=ae(i,s.candidates,a,o,s.errors),d=l.targetDate;n.setMessage(`Reading Calendar for ${d}\u2026`);let c=await me(d);c.warnings.length&&new u.Notice(`Calendar warning: ${c.warnings.join(" ")}`,8e3);let g=pe(this.settings.linkMatchingVaultNotes,()=>{n.setMessage("Matching vault notes\u2026");let k=this.app.vault.getMarkdownFiles().map(v=>({path:v.path,basename:v.basename,file:v,frontmatter:this.app.metadataCache.getFileCache(v)?.frontmatter}));return ye(fe(k,this.settings.excludedVaultFolders),v=>{if(!v.file)throw new Error(`Vault note is unavailable: ${v.path}`);return{linkText:this.app.metadataCache.fileToLinktext(v.file,i.path,!0)}})});this.settings.linkMatchingVaultNotes||n.setMessage("Skipping vault note matching\u2026");let y=Fe(c,g,this.settings);n.setMessage("Writing the active Daily Note\u2026");let O=this.app.workspace.getActiveFile();if(!O||this.app.vault.getAbstractFileByPath(i.path)!==i)throw new p("The active Daily Note changed, moved, or was deleted; import aborted before writing.");let le=ie(this.app),B=ae(O,le.candidates,a,o,le.errors);ze(i,O,l.settings,B.settings,d,B.targetDate),Be(l,B);let _=this.activeMarkdownEditor(i);if(_){let k=_.getValue(),v=oe(k,y.block);this.replaceEditorContent(_,k,v)}else await this.app.vault.process(i,k=>oe(k,y.block));r(Ye(d,i.basename,y.eventCount,y.linkCount,this.settings))}catch(i){let a=i instanceof w||i instanceof P||i instanceof p||i instanceof S?i.message:`Could not import Calendar events: ${i instanceof Error?i.message:String(i)}`;r(a)}}},se=class extends u.PluginSettingTab{constructor(t,n){super(t,n),this.plugin=n}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Calendar Daily Note Linker"}),this.plugin.excludedVaultFoldersPersistedInvalid&&t.createEl("p",{text:"Saved vault folder exclusions are invalid; correct them before importing Calendar events."}),t.createEl("h3",{text:"Formatting"}),new u.Setting(t).setName("Event heading level").setDesc("Each event title is rendered as a Markdown heading.").addDropdown(n=>{for(let r of[3,4,5,6])n.addOption(String(r),`Heading ${r}`);n.setValue(String(this.plugin.settings.eventHeadingLevel)).onChange(r=>{this.commitEventHeadingLevel(n,r)})}),new u.Setting(t).setName("Time format").setDesc("Timed events use the Calendar event's local timezone.").addDropdown(n=>{n.addOption("24-hour","24-hour \u2014 09:00 \u2013 09:30").addOption("12-hour","12-hour \u2014 9:00 AM \u2013 9:30 AM").setValue(this.plugin.settings.timeFormat).onChange(r=>{this.commitTimeFormat(n,r)})}),new u.Setting(t).setName("Link matching vault notes").setDesc("Add deterministic vault links for uniquely matched attendee names that appear in event titles.").addToggle(n=>{n.setValue(this.plugin.settings.linkMatchingVaultNotes).onChange(r=>{this.commitBoolean(n,"linkMatchingVaultNotes",r)})}),new u.Setting(t).setName("Link event titles to Calendar").setDesc("Link event titles to Calendar when available; with an in-title vault link, add a separate Calendar link on the same line.").addToggle(n=>{n.setValue(this.plugin.settings.linkEventTitles).onChange(r=>{this.commitBoolean(n,"linkEventTitles",r)})}),t.createEl("h3",{text:"Vault matching"}),new u.Setting(t).setName("Vault folders to exclude").setDesc("Optional vault-relative folders to skip when matching Calendar attendees; one path per line; exclusions include subfolders; blank searches all Markdown notes.").addTextArea(n=>{n.setPlaceholder(`Archive
Templates
Private/People`).setValue(this.plugin.excludedVaultFoldersInput??this.plugin.settings.excludedVaultFolders.join(`
`)),n.inputEl.addEventListener("blur",()=>{this.commitExcludedVaultFolders(n)})}),t.createEl("p",{text:"Open an existing configured Daily Note, then run the command; it updates that open note for its date and replaces the visible ## Calendar section under # Notes."})}async commitEventHeadingLevel(t,n){let r=this.plugin.settings.eventHeadingLevel,i=H(n);if(!i){t.setValue(String(r)),new u.Notice("Choose an event heading level from Heading 3 through Heading 6.");return}this.plugin.settings.eventHeadingLevel=i;try{await this.plugin.saveSettings()}catch(a){this.plugin.settings.eventHeadingLevel=r,t.setValue(String(r)),new u.Notice(`Could not save the Event heading level: ${a instanceof Error?a.message:String(a)}`)}}async commitTimeFormat(t,n){let r=this.plugin.settings.timeFormat,i=z(n);if(!i){t.setValue(r),new u.Notice("Choose 24-hour or 12-hour time format.");return}this.plugin.settings.timeFormat=i;try{await this.plugin.saveSettings()}catch(a){this.plugin.settings.timeFormat=r,t.setValue(r),new u.Notice(`Could not save the Time format: ${a instanceof Error?a.message:String(a)}`)}}async commitBoolean(t,n,r){let i=this.plugin.settings[n];this.plugin.settings[n]=r;try{await this.plugin.saveSettings()}catch(a){this.plugin.settings[n]=i,t.setValue(i),new u.Notice(`Could not save linking setting: ${a instanceof Error?a.message:String(a)}`)}}async commitExcludedVaultFolders(t){let n=[...this.plugin.settings.excludedVaultFolders],r=this.plugin.excludedVaultFoldersPersistedInvalid,i=this.plugin.excludedVaultFoldersInput,a=V(t.getValue());if(!a){this.plugin.excludedVaultFoldersPersistedInvalid||t.setValue(n.join(`
`)),new u.Notice("Use one safe vault-relative folder per line, or leave the field blank.");return}this.plugin.settings.excludedVaultFolders=a,this.plugin.excludedVaultFoldersPersistedInvalid=!1,this.plugin.excludedVaultFoldersInput=void 0,t.setValue(a.join(`
`));try{await this.plugin.saveSettings()}catch(o){this.plugin.settings.excludedVaultFolders=n,this.plugin.excludedVaultFoldersPersistedInvalid=r,this.plugin.excludedVaultFoldersInput=i,t.setValue(r?i??"":n.join(`
`)),new u.Notice(`Could not save excluded folders: ${o instanceof Error?o.message:String(o)}`)}}};
