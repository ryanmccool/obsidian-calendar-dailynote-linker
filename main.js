"use strict";var G=Object.defineProperty;var qe=Object.getOwnPropertyDescriptor;var Qe=Object.getOwnPropertyNames;var Xe=Object.prototype.hasOwnProperty;var et=(e,t)=>{for(var n in t)G(e,n,{get:t[n],enumerable:!0})},tt=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of Qe(t))!Xe.call(e,i)&&i!==n&&G(e,i,{get:()=>t[i],enumerable:!(r=qe(t,i))||r.enumerable});return e};var nt=e=>tt(G({},"__esModule",{value:!0}),e);var cn={};et(cn,{default:()=>W});module.exports=nt(cn);var u=require("obsidian");var ue=require("node:child_process"),ge=require("node:util");var f=class extends Error{constructor(t){super(t),this.name="CalendarPayloadValidationError"}};function A(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function D(e,t){if(typeof e!="string")throw new f(`${t} must be a string`);return e}function P(e,t){if(e!==null&&typeof e!="string")throw new f(`${t} must be a string or null`);return e}function M(e,t){let n=D(e,t);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(n)||Number.isNaN(Date.parse(n)))throw new f(`${t} must be a valid ISO date`);return n}function J(e){let t=D(e,"targetDate");if(!/^\d{4}-\d{2}-\d{2}$/.test(t))throw new f("targetDate must be YYYY-MM-DD");let[n,r,i]=t.split("-").map(Number),a=new Date(Date.UTC(n,r-1,i));if(a.getUTCFullYear()!==n||a.getUTCMonth()!==r-1||a.getUTCDate()!==i)throw new f("targetDate must be a valid calendar date");return t}function rt(e){return/^(?:EventKit|Some EventKit) (?:calendar|event URL|event title|attendee|attendee display name|attendee email|attendee status) data is unavailable on this macOS\/source\.$/.test(e)}var it=new Set(["unknown","pending","accepted","declined","tentative","delegated","completed","in-process"]);function at(e,t){let n=D(e,`attendee ${t} status`);if(!it.has(n))throw new f(`attendee ${t} status is not a stable EventKit status`);return n}function st(e,t){if(!A(e))throw new f(`events attendee ${t} must be an object`);return{displayName:P(e.displayName,`attendee ${t} displayName`),email:P(e.email,`attendee ${t} email`),status:at(e.status,t)}}function ot(e,t){if(!A(e))throw new f(`event ${t} must be an object`);let n=e.attendees;if(!Array.isArray(n))throw new f(`event ${t} attendees must be an array`);let r=M(e.start,`event ${t} start`),i=M(e.end,`event ${t} end`);if(Date.parse(i)<Date.parse(r))throw new f(`event ${t} end cannot precede start`);if(typeof e.allDay!="boolean")throw new f(`event ${t} allDay must be a boolean`);return{id:P(e.id,`event ${t} id`),calendar:P(e.calendar,`event ${t} calendar`),title:D(e.title,`event ${t} title`),start:r,end:i,allDay:e.allDay,url:P(e.url,`event ${t} url`),location:P(e.location,`event ${t} location`),notes:e.notes===null?null:(()=>{throw new f(`event ${t} notes must be null`)})(),attendees:n.map((a,s)=>st(a,s))}}function ce(e){let t;try{t=JSON.parse(e)}catch{throw new f("Calendar bridge output was not valid JSON")}return lt(t)}function lt(e){if(!A(e))throw new f("Calendar bridge output must be a JSON object");if(e.schemaVersion!==1)throw new f("Calendar bridge output has an unsupported schema version");if(!A(e.range))throw new f("Calendar bridge output range must be an object");let t=M(e.range.start,"range start"),n=M(e.range.end,"range end");if(Date.parse(n)<=Date.parse(t))throw new f("range end must be after range start");let r=D(e.range.timeZone,"range timeZone").trim();if(!r)throw new f("range timeZone cannot be empty");if(!Array.isArray(e.events))throw new f("Calendar bridge output events must be an array");if(!Array.isArray(e.warnings)||e.warnings.some(a=>typeof a!="string"))throw new f("Calendar bridge output warnings must be an array of strings");let i=e.warnings;return{schemaVersion:1,source:D(e.source,"source"),targetDate:J(e.targetDate),range:{start:t,end:n,timeZone:r},events:e.events.map((a,s)=>ot(a,s)),warnings:i.map(a=>{if(!rt(a))throw new f("Calendar bridge warnings may only describe unavailable optional EventKit data");return a})}}var $=`/*
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

function calendarInfo(calendar) {
  var id = readOptionalProperty(calendar, "calendarIdentifier");
  var title = readOptionalProperty(calendar, "title");
  if (!id.available || !title.available) return null;
  var calendarId = stringOrNull(id.value);
  var calendarTitle = stringOrNull(title.value);
  if (calendarId === null || calendarTitle === null) return null;
  var source = readOptionalProperty(calendar, "source");
  var sourceTitle = source.available && source.value !== null
    ? stringOrNull(readOptionalProperty(source.value, "title").value)
    : null;
  return { id: calendarId, title: calendarTitle, source: sourceTitle };
}

function eventCalendars(store) {
  var calendars;
  try {
    calendars = store.calendarsForEntityType($.EKEntityTypeEvent);
  } catch (error) {
    throw new Error("EventKit calendar query failed.");
  }
  var count = collectionCount(calendars);
  if (count === null || typeof calendars.objectAtIndex !== "function") {
    throw new Error("EventKit returned an invalid calendar collection.");
  }
  return calendars;
}

function parseSelectedCalendarIds(value) {
  if (value === undefined) return null;
  var ids;
  try {
    ids = JSON.parse(value);
  } catch (error) {
    throw new Error("Calendar selection must be valid JSON.");
  }
  if (!Array.isArray(ids) || !ids.every(function (id) { return typeof id === "string" && id.length > 0; })) {
    throw new Error("Calendar selection must be an array of calendar identifiers.");
  }
  return ids;
}

function calendarsMatchingIds(store, ids) {
  if (ids === null) return null;
  var wanted = {};
  ids.forEach(function (id) { wanted[id] = true; });
  var calendars = eventCalendars(store);
  var selected = $.NSMutableArray.alloc.init;
  var count = collectionCount(calendars);
  for (var index = 0; index < count; index += 1) {
    var calendar = calendars.objectAtIndex(index);
    var info = calendarInfo(calendar);
    if (info !== null && wanted[info.id]) selected.addObject(calendar);
  }
  return selected;
}

function listCalendars() {
  var calendars = eventCalendars(eventStore());
  var result = [];
  var count = collectionCount(calendars);
  for (var index = 0; index < count; index += 1) {
    var info = calendarInfo(calendars.objectAtIndex(index));
    if (info !== null) result.push(info);
  }
  result.sort(function (left, right) {
    return (left.source || "").localeCompare(right.source || "") || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
  });
  return JSON.stringify(result);
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

function main(targetDate, selectedCalendarIds) {
  if (typeof targetDate !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(targetDate)) {
    throw new Error("Calendar target date must be YYYY-MM-DD.");
  }
  var range = localDate(targetDate);
  var warnings = [];
  var store = eventStore();
  var start = $.NSDate.dateWithTimeIntervalSince1970(range.start.getTime() / 1000);
  var end = $.NSDate.dateWithTimeIntervalSince1970(range.end.getTime() / 1000);
  var calendars = calendarsMatchingIds(store, selectedCalendarIds);
  var predicate;
  if (calendars !== null) {
    try {
      predicate=store.predicateForEventsWithStartDateEndDateCalendars(start,end,calendars);
    } catch (error) {
      throw new Error("EventKit predicate creation failed for the selected calendars.");
    }
  } else {
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
  if (!argv || !argv.length) throw new Error("Calendar target date argument is required.");
  if (argv.length === 1 && argv[0] === "--list-calendars") return listCalendars();
  if (argv.length > 2) throw new Error("Calendar target date and selection arguments are required.");
  return main(argv[0], parseSelectedCalendarIds(argv[1]));
}
`;var dt=(0,ge.promisify)(ue.execFile),fe=async(e,t,n)=>await dt(e,t,n),h=class extends Error{constructor(t,n=!1){super(t),this.name="CalendarBridgeError",this.isPermissionFailure=n}},ct=/\bEVENTKIT_PERMISSION_(?:DENIED|RESTRICTED|WRITE_ONLY|REQUEST_TIMEOUT|UNAVAILABLE)\b/;function N(e){return typeof e!="string"?"":e.replace(/[\u0000-\u001f\u007f-\u009f]/gu," ").replace(/\s+/gu," ").trim().slice(0,500)}function F(e){return(typeof e=="string"?e.match(ct):null)?.[0]??null}function S(e){return`EventKit Calendar permission failed (${e}). Allow Calendar access in System Settings \u2192 Privacy & Security \u2192 Calendars, then try again.`}function E(e){return`EventKit bridge failed: ${e||"no diagnostic details were returned."}`}function pe(e){let t=e,n=N(t?.stderr),r=N(t?.message);return{details:n||r,code:F(`${n} ${r}`)}}function ut(e,t){return t===null?["-l","JavaScript","-e",$,e]:["-l","JavaScript","-e",$,e,JSON.stringify(t)]}function gt(e){let t;try{t=JSON.parse(e)}catch{throw new Error("EventKit returned invalid calendar data.")}if(!Array.isArray(t))throw new Error("EventKit returned invalid calendar data.");let n=[];for(let r of t){if(typeof r!="object"||r===null||Array.isArray(r))throw new Error("EventKit returned invalid calendar data.");let{id:i,title:a,source:s}=r;if(typeof i!="string"||!i||/[\u0000-\u001f\u007f-\u009f]/u.test(i)||typeof a!="string"||!a||/[\u0000-\u001f\u007f-\u009f]/u.test(a)||s!==null&&(typeof s!="string"||/[\u0000-\u001f\u007f-\u009f]/u.test(s)))throw new Error("EventKit returned invalid calendar data.");n.push({id:i,title:a,source:s})}return n}async function me(e=fe){let t;try{t=await e("/usr/bin/osascript",["-l","JavaScript","-e",$,"--list-calendars"],{encoding:"utf8",timeout:3e4,maxBuffer:2*1024*1024,shell:!1,windowsHide:!0})}catch(r){let i=pe(r);throw i.code?new h(S(i.code),!0):new h(E(i.details))}let n=t.stdout.trim();if(!n){let r=F(t.stderr);throw r?new h(S(r),!0):new h(E(N(t.stderr)))}try{return gt(n)}catch(r){throw new h(E(N(r instanceof Error?r.message:String(r))))}}async function he(e,t=null,n=fe){let r=typeof t=="function"?null:t,i=typeof t=="function"?t:n;try{J(e)}catch(o){throw new h(o instanceof Error?o.message:"Calendar target date must be YYYY-MM-DD.")}let a;try{a=await i("/usr/bin/osascript",ut(e,r),{encoding:"utf8",timeout:3e4,maxBuffer:2*1024*1024,shell:!1,windowsHide:!0})}catch(o){let l=pe(o);throw l.code?new h(S(l.code),!0):new h(E(l.details))}let s=a.stdout.trim();if(!s){let o=N(a.stderr),l=F(a.stderr);throw l?new h(S(l),!0):new h(E(o))}try{let o=ce(s);if(o.targetDate!==e)throw new Error(`Calendar bridge returned ${o.targetDate} instead of ${e}.`);return o}catch(o){let l=N(o instanceof Error?o.message:String(o)),d=N(a.stderr),c=F(`${d} ${l}`);throw c?new h(S(c),!0):new h(E([d,l].filter(Boolean).join(" | ")))}}function ft(){return{byEmail:new Map,byName:new Map}}function ve(e,t){return e?t():ft()}function Z(e,t,n){if(!t)return;let r=e.get(t)??[];r.some(i=>i.path===n.path)||(r.push(n),r.sort((i,a)=>i.path.localeCompare(a.path))),e.set(t,r)}function R(e){return e.normalize("NFKC").toLowerCase().replaceAll("\u03C2","\u03C3")}function k(e){return R(e).trim().replace(/\s+/gu," ")}function V(e){return R(e).trim().replace(/\s+/gu,"")}function q(e,t){let n=e?.[t];return typeof n=="string"?[n]:Array.isArray(n)?n.filter(r=>typeof r=="string"):[]}function pt(e){let t=e.path.replaceAll("\\","/"),n=e.basename||t.split("/").at(-1)?.replace(/\.md$/i,"")||"";return{path:t,basename:n,file:e.file}}function mt(e,t){let n=e.replaceAll("\\","/");return t.some(r=>{let i=r.replaceAll("\\","/").replace(/\/+$/u,"");return n===i||n.startsWith(`${i}/`)})}function we(e,t){let n=new Map,r=new Map;for(let i of e){let a=i.path.replaceAll("\\","/");if(!a.toLowerCase().endsWith(".md")||mt(a,t))continue;let s=pt(i);Z(r,k(s.basename),s);for(let o of q(i.frontmatter,"aliases"))Z(r,k(o),s);for(let o of[...q(i.frontmatter,"email"),...q(i.frontmatter,"emails")])Z(n,V(o),s)}return{byEmail:n,byName:r}}function ye(e,t){let n=t.email?V(t.email):"";if(n){let a=e.byEmail.get(n);if(a?.length===1)return a[0];if(a&&a.length>1)return null}let r=t.displayName?k(t.displayName):"";if(!r)return null;let i=e.byName.get(r);return i?.length===1?i[0]:null}function Ce(e,t){let n=new Map,r=(a,s)=>{if(!s||typeof s.linkText!="string")throw new Error(`Vault note link data is invalid for ${a.path}.`);if(!s.linkText.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(s.linkText)||s.linkText.includes("<!-- calendar-daily-note-linker:start -->")||s.linkText.includes("<!-- calendar-daily-note-linker:end -->"))throw new Error(`Vault note link data is unsafe for ${a.path}.`);return{linkText:s.linkText}},i=a=>a.map(s=>{let o=n.get(s.path);return o===void 0&&(o=r(s,t(s)),n.set(s.path,o)),{...s,...o}});return{byEmail:new Map([...e.byEmail].map(([a,s])=>[a,i(s)])),byName:new Map([...e.byName].map(([a,s])=>[a,i(s)]))}}function ht(e){return/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(e)}function vt(e){return!e||/[\r\n\u2028\u2029]/u.test(e)||ht(e)?!1:/^#{1,6}[ \t]+\S(?:.*)$/u.test(e.trim())}function wt(e){let t=/^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(e);if(!t)return null;let n=t[2];return{character:n[0],length:n.length}}function yt(e,t){return new RegExp(`^ {0,3}${t.character}{${t.length},}[ \\t]*$`,"u").test(e)}function Q(e){let t=e.split(`
`),n=[],r=0,i=t.length>0&&t[0].replace(/^\ufeff/u,"").trim()==="---",a=null;for(let s of t){let o=s.endsWith("\r")?s.slice(0,-1):s,l=r+o.length;if(i){r!==0&&(o.trim()==="---"||o.trim()==="...")&&(i=!1),r+=s.length+1;continue}if(a){yt(o,a)&&(a=null),r+=s.length+1;continue}let d=wt(o);if(d){let g=o.replace(/^ {0,3}(`{3,}|~{3,})/u,"");(d.character==="~"||!g.includes("`"))&&(a=d),r+=s.length+1;continue}if(/^(?: {4}|\t)/u.test(o)){r+=s.length+1;continue}let c=o.trim();vt(c)&&n.push({text:c,start:r,contentEnd:l}),r+=s.length+1}return n}var H="<!-- calendar-daily-note-linker:start -->",O="<!-- calendar-daily-note-linker:end -->",X="## Calendar",m=class extends Error{constructor(t){super(t),this.name="CalendarBlockError"}};function ee(e){return[X,...e.map(Pe)].join(`
`)}function ke(e){let t=Ct(e),n=xt(e),r=n.filter(g=>g.text==="# Notes");if(r.length!==1)throw new m("The # Notes heading was not found exactly once.");let i=r[0],s=n.find(g=>g.start>i.start&&g.level===1)?.start??e.length,o=n.filter(g=>g.text===X).filter(g=>!t||!De(g.start,t));if(o.length>1)throw new m("The Calendar section is duplicated.");let l=o[0],d=l?Nt(e,l,n,t):null,c=t&&l&&d&&Pt(e,t,l,d)?d:null;if(t&&d&&Dt(t,d)&&!c)throw new m("The legacy Calendar block is inside a non-empty Calendar section.");if(l&&!c&&(l.start<i.contentEnd||l.start>=s))throw new m("The Calendar section is outside the # Notes section.");return{newline:e.includes(`\r
`)?`\r
`:`
`,notes:i,notesEnd:s,markerRange:t,calendarSectionRange:d,legacyWrapperRange:c,kind:t?"legacy-marker":l?"visible-section":"new-section"}}function Ne(e,t){kt(t);let n=ke(e);if(n.kind==="visible-section"){if(!n.calendarSectionRange)throw new m("The Calendar section boundary could not be determined.");return Ee(e,n.calendarSectionRange,t,n.newline)}if(n.kind==="legacy-marker"){if(!n.markerRange)throw new m("The legacy Calendar block range could not be determined.");let r=xe(e,n.markerRange),i=n.legacyWrapperRange?xe(r,Et(n.legacyWrapperRange,n.markerRange)):r,a=ke(i);return be(i,a,t,e.endsWith(`
`))}return be(e,n,t,e.endsWith(`
`))}function Ct(e){let t=Lt(e),n=[],r=[],i=t.length>0&&t[0].content.replace(/^\ufeff/u,"").trim()==="---",a=null;for(let s of t){if(i){s.start!==0&&(s.content.trim()==="---"||s.content.trim()==="...")&&(i=!1);continue}if(a){It(s.content,a)&&(a=null);continue}let o=St(s.content);if(o){let g=s.content.replace(/^ {0,3}(`{3,}|~{3,})/u,"");(o.character==="~"||!g.includes("`"))&&(a=o);continue}let l=s.content===H,d=s.content===O;if((s.content.includes(H)||s.content.includes(O))&&!l&&!d)throw new m("The Calendar section marker must be on an exact standalone line.");/^(?: {4}|\t)/u.test(s.content)||(l&&n.push(s),d&&r.push(s))}if(n.length===0&&r.length===0)return null;if(n.length!==1||r.length!==1||n[0].start>=r[0].start)throw new m("The Calendar section markers are duplicated, incomplete, or out of order.");return{start:n[0].start,end:r[0].next}}function kt(e){let t=e.split(`
`).map(n=>n.endsWith("\r")?n.slice(0,-1):n);if(t[0]!==X)throw new m("Generated Calendar content must start with the ## Calendar heading.");if(t.some(n=>n.includes(H)||n.includes(O)))throw new m("Generated Calendar content must not contain legacy section markers.");if(t.slice(1).some(n=>/^\s{0,3}#{1,2}[ \t]+\S/u.test(n)))throw new m("Generated Calendar events must use Heading 3 through Heading 6.")}function Pe(e){return e.replace(/\r\n?|\n|\u2028|\u2029/gu," ").replace(/[\u0000-\u001f\u007f-\u009f]/gu,"").replaceAll(H,"[calendar section start]").replaceAll(O,"[calendar section end]")}function te(e){return Pe(e).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replace(/[\\`*_{}\[\]()#+\-.!|>~]/gu,"\\$&")}function bt(e){return e.match(/^#+/u)?.[0].length??0}function xt(e){return Q(e).map(t=>({...t,end:t.contentEnd,level:bt(t.text)}))}function Nt(e,t,n,r=null){let i=n.find(a=>a.start>t.start&&a.level<=2&&(!r||!De(a.start,r)));return{start:t.start,end:i?.start??e.length}}function Pt(e,t,n,r){return t.start<n.contentEnd||t.end>r.end?!1:/^\s*$/u.test(e.slice(n.contentEnd,t.start))&&/^\s*$/u.test(e.slice(t.end,r.end))}function Dt(e,t){return e.start<t.end&&t.start<e.end}function De(e,t){return e>=t.start&&e<t.end}function Et(e,t){let n=t.end-t.start;return{start:e.start<=t.start?e.start:e.start-n,end:e.end<=t.start?e.end:e.end-n}}function be(e,t,n,r){if(t.kind==="visible-section"){if(!t.calendarSectionRange)throw new m("The Calendar section boundary could not be determined.");return Ee(e,t.calendarSectionRange,n,t.newline)}if(t.kind==="new-section")return Tt(e,t,n,t.newline,r);throw new m("The legacy Calendar block could not be migrated safely.")}function Ee(e,t,n,r){let i=e.slice(t.start,t.end),a=Te(n,r)+(i.endsWith(`
`)?r:"");return`${e.slice(0,t.start)}${a}${e.slice(t.end)}`}function Tt(e,t,n,r,i){let a=e.slice(0,t.notesEnd),s=e.slice(t.notesEnd),o=a.endsWith(`
`)?"":r,l=s.length>0||i?r:"";return`${a}${o}${Te(n,r)}${l}${s}`}function Te(e,t){return e.replace(/\r\n?|\n/gu,t)}function xe(e,t){return`${e.slice(0,t.start)}${e.slice(t.end)}`}function St(e){let t=/^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(e);if(!t)return null;let n=t[2];return{character:n[0],length:n.length}}function It(e,t){return new RegExp(`^ {0,3}${t.character}{${t.length},}[ \\t]*$`,"u").test(e)}function Lt(e){let t=e.split(`
`),n=[],r=0;for(let i of t){let a=i.endsWith("\r")?i.slice(0,-1):i,s=r+i.length;n.push({content:a,start:r,end:s,next:Math.min(e.length,s+1)}),r=s+1}return n}var At={eventHeadingLevel:3,timeFormat:"24-hour",linkMatchingVaultNotes:!0,linkEventTitles:!0};function Se(e){return e.replaceAll("\\","\\\\").replace(/[\s<>]/gu,t=>encodeURIComponent(t)).replaceAll("(","\\(").replaceAll(")","\\)").replaceAll('"',"%22")}function ne(e){if(!e?.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(e)||e.includes("<!-- calendar-daily-note-linker:start -->")||e.includes("<!-- calendar-daily-note-linker:end -->"))return null;try{let t=new URL(e.trim());return t.protocol==="http:"||t.protocol==="https:"?t.href:null}catch{return null}}function Me(e,t){if(e.allDay!==t.allDay)return e.allDay?-1:1;let n=Date.parse(e.start)-Date.parse(t.start);if(n!==0)return n;let r=Date.parse(e.end)-Date.parse(t.end);return r!==0?r:e.title.localeCompare(t.title)}function Mt(e){let t=[...new Set(e.attendees.map(n=>JSON.stringify([V(n.email??""),k(n.displayName??"")])))].sort();return JSON.stringify([k(e.title),e.start,e.end,e.allDay,ne(e.url)??"",t])}function $e(e){let t=new Set,n=[];for(let r of e){let i=Mt(r);t.has(i)||(t.add(i),n.push(r))}return n}function z(e,t,n="24-hour"){let r={timeZone:t,hour:"numeric",minute:"2-digit",hour12:n==="12-hour",...n==="24-hour"?{hourCycle:"h23"}:{}};try{return new Intl.DateTimeFormat("en-US",r).format(new Date(e))}catch{return new Intl.DateTimeFormat("en-US",{...r,timeZone:void 0}).format(new Date(e))}}function $t(e){return te(e).replaceAll("\\-","-")}function Ft(e){let t=Intl.Segmenter;if(t)return[...new t(void 0,{granularity:"grapheme"}).segment(e)];let n=[],r=0;for(let i of e){let a=r;r+=i.length;let s=i;for(;r<e.length;){let o=e.codePointAt(r);if(o===void 0)break;let l=String.fromCodePoint(o);if(!/[\p{M}\u200d\ufe0e\ufe0f]/u.test(l)&&!s.endsWith("\u200D"))break;s+=l,r+=l.length}n.push({index:a,segment:s})}return n}function Rt(e){let t=[],n=[],r=[],i,a,s=(o,l,d)=>{t.push(o);for(let c=0;c<o.length;c+=1)n.push(l),r.push(d)};for(let o of Ft(e)){let l=R(o.segment),d=o.index+o.segment.length;if(/^\s+$/u.test(l)){i??(i=o.index),a=d;continue}t.length>0&&i!==void 0&&a!==void 0&&s(" ",i,a),i=void 0,a=void 0,s(l,o.index,d)}return{value:t.join(""),starts:n,ends:r}}function Ie(e){return e!==void 0&&/[\p{L}\p{N}\p{M}_]/u.test(e)}function Vt(e,t){if(t<=0)return;let n=t-1,r=e.charCodeAt(n);r>=56320&&r<=57343&&n>0&&(n-=1);let i=e.codePointAt(n);return i===void 0?void 0:String.fromCodePoint(i)}function Ht(e,t){let n=e.codePointAt(t);return n===void 0?void 0:String.fromCodePoint(n)}var Ot=new Set(["a","an","and","at","by","dr","for","from","in","mr","mrs","ms","of","on","or","prof","the","to","with"]);function Le(e){let t=e?k(e):"";if(!t||t.includes(","))return null;let n=t.match(/[\p{L}\p{N}\p{M}]+(?:['-][\p{L}\p{N}\p{M}]+)*/u)?.[0]??"";return!n||[...n].length<2||/^\p{N}+$/u.test(n)||Ot.has(n)?null:n}function Ae(e,t){let n=t?k(t):"";n&&!e.fullNames.includes(n)&&e.fullNames.push(n)}function zt(e,t){let n=new Map;for(let i of t){let a=ye(e,i);if(!a||!a.linkText)continue;let s=n.get(a.path)??{target:a,fullNames:[],shortName:null};Ae(s,i.displayName),Ae(s,s.target.basename),s.shortName??(s.shortName=Le(i.displayName)??Le(s.target.basename)),n.set(a.path,s)}let r=new Map;for(let i of n.values()){let a=i.shortName?[...i.fullNames,i.shortName]:i.fullNames;for(let s of a){let o=r.get(s)??new Set;o.add(i.target.path),r.set(s,o)}}return[...n.values()].map(i=>{let a=i.fullNames.filter(s=>r.get(s)?.size===1);return i.shortName&&r.get(i.shortName)?.size===1&&!a.includes(i.shortName)&&a.push(i.shortName),{target:i.target,names:a}})}function Yt(e){let t=new Map;for(let[n,r]of e.byName){let i=k(n);if(i)for(let a of r){if(!a.linkText)continue;let s=t.get(a.path)??{target:a,names:[]};s.names.includes(i)||s.names.push(i),t.set(a.path,s)}}return[...t.values()]}function Fe(e,t){if(!t.some(i=>i.names.length>0&&!!i.target.linkText))return[];let n=Rt(e),r=[];for(let i of t)if(i.target.linkText)for(let a of i.names){let s=0;for(;s<n.value.length;){let o=n.value.indexOf(a,s);if(o<0)break;let l=o+a.length;if(!Ie(Vt(n.value,o))&&!Ie(Ht(n.value,l))){let d=n.starts[o],c=n.ends[o];for(let g=o+1;g<l;g+=1)d=Math.min(d,n.starts[g]),c=Math.max(c,n.ends[g]);r.push({start:d,end:c,normalizedLength:a.length,target:i.target})}s=o+1}}return r}function Re(e){e.sort((n,r)=>n.normalizedLength!==r.normalizedLength?r.normalizedLength-n.normalizedLength:n.start!==r.start?n.start-r.start:r.end-n.end);let t=[];for(let n of e)t.some(r=>n.start<r.end&&r.start<n.end)||t.push(n);return t.sort((n,r)=>n.start-r.start)}function Bt(e,t){return Re(Fe(e,t))}function _t(e,t){let n=Fe(e,t);if(!n.length)return[];let r=Math.max(...n.map(s=>s.normalizedLength)),i=n.filter(s=>s.normalizedLength===r);return new Set(i.map(s=>s.target.path)).size!==1?[]:Re(i)}function Wt(e){return e.replaceAll("<!-- calendar-daily-note-linker:start -->","[calendar section start]").replaceAll("<!-- calendar-daily-note-linker:end -->","[calendar section end]").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu,"").replaceAll("\\","\\\\").replaceAll("|","\\|").replaceAll("]","\\]")}function Ut(e,t,n){return e.linkText?`[[${Wt(e.linkText)}|${n(t)}]]`:null}function Kt(e,t,n){return Ve(e,Bt(e,t),n)}function Ve(e,t,n){let r="",i=0,a=0;for(let s of t){let o=Ut(s.target,e.slice(s.start,s.end),n);o&&(r+=n(e.slice(i,s.start)),r+=o,i=s.end,a+=1)}return r+=n(e.slice(i)),{title:r,linkCount:a}}function He(e,t,n,r){if(!n)return{title:r(e.title),linkCount:0};let i=Kt(e.title,zt(t,e.attendees),r);return i.linkCount>0?i:Ve(e.title,_t(e.title,Yt(t)),r)}function Oe(e,t){if(!t)return e.title;let n=`[Calendar](${Se(t)})`;return e.linkCount>0?`${e.title} \xB7 ${n}`:`[${e.title}](${Se(t)})`}function jt(e,t,n,r){let i=r.linkEventTitles?ne(e.url):null,a=He(e,n,r.linkMatchingVaultNotes,$t),s=Oe(a,i),o=Math.min(6,Math.max(3,r.eventHeadingLevel)),l=`${"#".repeat(o)} ${s}`,d=e.allDay?"All day":`${z(e.start,t.range.timeZone,r.timeFormat)} \u2013 ${z(e.end,t.range.timeZone,r.timeFormat)}`;return{lines:[l,d],linkCount:a.linkCount}}function Gt(e,t,n){let r=[],i=$e(e.events).sort(Me),a=0;if(!i.length)r.push(`No Calendar events found for ${e.targetDate}.`);else for(let s of i){let o=jt(s,e,t,n);r.push(...o.lines),a+=o.linkCount}return{block:ee(r),eventCount:i.length,linkCount:a}}function Jt(e,t,n){let r=[],i=$e(e.events).sort(Me),a=0;if(!i.length)r.push(`No Calendar events found for ${e.targetDate}.`);else for(let s of i){let o=ne(s.url),l=He(s,n,!0,te),d=Oe(l,o),c=s.allDay?"All day":`${z(s.start,e.range.timeZone,"12-hour")}\u2013${z(s.end,e.range.timeZone,"12-hour")}`;r.push(`### ${d}`),r.push(c),a+=l.linkCount}return{block:ee(r),eventCount:i.length,linkCount:a}}function ze(e,t,n){return typeof t=="string"?Jt(e,t,n):Gt(e,t,{...At,...n})}var b={excludedVaultFolders:[],selectedCalendarIds:null,insertionMode:"heading",insertionHeading:"# Notes",eventHeadingLevel:3,timeFormat:"24-hour",linkMatchingVaultNotes:!0,linkEventTitles:!0},re=class extends Error{constructor(){super("Vault folder exclusions are malformed. Correct them in settings before importing Calendar events."),this.name="ExcludedVaultFolderError"}};function Zt(e){let t=e.replaceAll("\\","/"),n=t.split("/");if(!(!t||t.startsWith("/")||/^[A-Za-z]:/.test(t)||n.some(r=>r.length===0||r==="."||r===".."||r.includes("\0"))))return t}function Y(e){let t=Array.isArray(e),n=typeof e=="string"?e.split(/\r\n?|\n|\u2028|\u2029/gu):t&&e.every(i=>typeof i=="string")?e:void 0;if(!n)return;let r=[];for(let i of n){if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(i))return;if(!i.trim())continue;let a=Zt(i);if(!a)return;r.includes(a)||r.push(a)}return r}function Ye(e){if(e===void 0)return b.excludedVaultFolders;let t=Y(e);if(!t)throw new re;return t}function Be(e){if(e==null)return null;if(!Array.isArray(e)||!e.every(n=>typeof n=="string"))return;let t=[];for(let n of e){if(!n||/[\u0000-\u001f\u007f-\u009f]/u.test(n))return;t.includes(n)||t.push(n)}return t}function _e(e){let t=Be(e);if(t===void 0)throw new Error("Calendar selection is malformed. Correct it in settings before importing Calendar events.");return t}function qt(e){if(e==null)return{ids:null,malformed:!1};let t=Be(e);return t!==void 0?{ids:t,malformed:!1}:{ids:[],malformed:!0,rawInput:e}}function Qt(e){if(e===void 0)return{folders:[],malformed:!1};let t=Y(e);return t?{folders:t,malformed:!1}:{folders:[],malformed:!0,rawInput:typeof e=="string"?e:Array.isArray(e)?e.map(String).join(`
`):String(e)}}function B(e){let t=typeof e=="string"&&/^\d+$/u.test(e)?Number(e):e;return t===2?3:t===3||t===4||t===5||t===6?t:void 0}function Xt(e){return B(e)??b.eventHeadingLevel}function _(e){return e==="24-hour"||e==="12-hour"?e:void 0}function en(e){return _(e)??b.timeFormat}function I(e,t){return typeof e=="boolean"?e:t}function We(e){let t=typeof e=="object"&&e!==null&&!Array.isArray(e)?e:{};return{excludedVaultFolders:Qt(t.excludedVaultFolders),selectedCalendarIds:qt(t.selectedCalendarIds),insertionMode:"heading",insertionHeading:"# Notes",eventHeadingLevel:Xt(t.eventHeadingLevel),timeFormat:en(t.timeFormat),linkMatchingVaultNotes:I(t.linkMatchingVaultNotes,b.linkMatchingVaultNotes),linkEventTitles:I(t.linkEventTitles,b.linkEventTitles)}}var p=class extends Error{constructor(t){super(t),this.name="ActiveDailyNoteError"}};function tn(e){return(e??"").replaceAll("\\","/").replace(/\/+$/u,"")}function nn(e){let t=[],n=0;for(;n<e.length;){if(e[n]==="\\"){n+=2;continue}if(e[n]==="["){let r=e.indexOf("]",n+1);n=r===-1?e.length:r+1;continue}if(/[YMD]/u.test(e[n])){let r=n,i=e[n];for(;n<e.length&&e[n]===i&&n-r<5;)n+=1;t.push({token:e.slice(r,n),start:r,end:n});continue}n+=1}return t}function rn(e){if(typeof e!="string"||!e)return!1;let t=nn(e),n=t.filter(({token:o})=>o.startsWith("D")),r=n.some(({token:o})=>o.length>=3),i=n.some(({token:o})=>o.length<=2),a=t.some(({token:o})=>o.startsWith("M"));return!t.some(({token:o})=>o.startsWith("Y"))||!(r||a&&i)?!1:t.some(({token:o})=>o==="YYYY")}function an(e,t){let n=e.replaceAll("\\","/"),r=t?`${t}/`:"";if(t&&!n.startsWith(r))throw new p("The active note is outside the configured core Daily Notes folder.");let i=n.slice(r.length);if(!i.endsWith(".md"))throw new p("The active note must be a Markdown Daily Note.");return i.slice(0,-3)}function Ue(e,t,n,r,i){if(e.extension.toLowerCase()!=="md")throw new p("Open an existing configured Daily Note before running this command.");if(!rn(t.format))throw new p("The core Daily Notes filename format cannot identify one calendar date.");let a=tn(t.folder),s=t.format,o=an(e.path,a),l=n(o,s,!0);if(!l?.isValid()||l.format(s)!==o){if(!i)throw new p("The active note path is not the canonical core Daily Note for one date.");let g=n(o,s,!1);if(!g?.isValid())throw new p("The active note path is not the canonical core Daily Note for one date.");let x=Ke(o,s,g.format("YYYY-MM-DD"),i);if(x.length!==1)throw new p("The active note path can represent more than one calendar date.");l=x[0]}let d=`${a?`${a}/`:""}${l.format(s)}.md`;if(e.path.replaceAll("\\","/")!==d)throw new p("The active note path is not the canonical core Daily Note path.");if(!i||on(o,s,l,i))throw new p("The active note path can represent more than one calendar date.");if(r&&!s.includes("/")){let g=r(e,"day");if(g?.isValid()&&g.format("YYYY-MM-DD")!==l.format("YYYY-MM-DD"))throw new p("The active note date could not be confirmed by core Daily Notes.")}let c=l.format("YYYY-MM-DD");if(!/^\d{4}-\d{2}-\d{2}$/u.test(c))throw new p("The active note did not resolve to one calendar date.");return c}function sn(e,t){let n=new Date(Date.UTC(e,0,1+t));return`${String(n.getUTCFullYear()).padStart(4,"0")}-${String(n.getUTCMonth()+1).padStart(2,"0")}-${String(n.getUTCDate()).padStart(2,"0")}`}function Ke(e,t,n,r){let i=Number(n.slice(0,4)),a=[],s=[i-100,i-1,i,i+1,i+100];for(let o of s){let l=new Date(Date.UTC(o,1,29)).getUTCDate()===29?366:365;for(let d=0;d<l;d+=1){let c=r(sn(o,d));c?.isValid()&&c.format(t)===e&&a.push(c)}}return a}function on(e,t,n,r){let i=n.format("YYYY-MM-DD");return Ke(e,t,i,r).some(s=>s.format("YYYY-MM-DD")!==i)}function je(e,t,n,r,i,a){if(!t||t!==e||t.path!==e.path||t.basename!==e.basename)throw new p("The active Daily Note changed, moved, or was deleted; import aborted before writing.");if((n.folder??"")!==(r.folder??"")||(n.format??"")!==(r.format??"")||(n.template??"")!==(r.template??"")||i!==a)throw new p("The active Daily Note or core Daily Notes configuration changed; import aborted before writing.")}function ln(e){return"under # Notes"}function dn(e){let t=[e.linkMatchingVaultNotes?"vault-note links on (attendee/title phrases)":"vault-note links off",e.linkEventTitles?"Calendar URL links on (separate when needed)":"Calendar URL links off"];return`Heading ${e.eventHeadingLevel}, ${e.timeFormat}, ${t.join(", ")}`}function Ge(e,t,n,r,i){if(!i){if(n===0)return`No Calendar events found for ${e}. The active Daily Note was updated.`;let d=n===1?"event":"events";return r===0?`Imported ${n} Calendar ${d} into ${t}. No uniquely matched attendee names or title phrases appeared in event titles.`:`Imported ${n} Calendar ${d} into ${t} and added ${r} vault ${r===1?"link":"links"} for matched attendee names or title phrases.`}let a=`${ln(i)}; ${dn(i)}; visible Calendar section updated`;if(n===0)return`No Calendar events found for ${e}; updated ${t} (${a}).`;let s=n===1?"event":"events",l=r===0?i.linkMatchingVaultNotes?"No uniquely matched attendee names or title phrases appeared in event titles.":"Vault-note matching links are disabled.":`Added ${r} vault ${r===1?"link":"links"} for matched attendee names or title phrases.`;return`Imported ${n} Calendar ${s} into ${t} (${a}). ${l}`}var v=class extends Error{constructor(t,n){super(n),this.name="DailyNoteProviderCompatibilityError",this.kind=t}},T=class extends Error{constructor(t){super(t),this.name="DailyNoteProviderError"}};function C(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function ie(e,t,n,r){let i=e[t];if(i===void 0)return n;if(typeof i!="string")throw new v(r,`${r==="core"?"Core Daily Notes":"Periodic Notes"} ${t} setting has an unsupported shape.`);return t==="format"&&i.trim()===""?n:t==="folder"||t==="template"?i.trim():i}function Je(e,t){return{folder:ie(e,"folder","",t),format:ie(e,"format","YYYY-MM-DD",t),template:ie(e,"template","",t)}}function ae(e){if(!C(e))return{candidates:[],errors:[new v("core","Core Daily Notes provider shape is unavailable.")]};let t=[],n=[];try{let i=(C(e.internalPlugins)&&C(e.internalPlugins.plugins)?e.internalPlugins.plugins:void 0)?.["daily-notes"];if(C(i)&&i.enabled===!0)if(!C(i.instance)||!C(i.instance.options))n.push(new v("core","Core Daily Notes settings/options are unavailable or unsupported."));else try{t.push({kind:"core",settings:Je(i.instance.options,"core")})}catch(a){a instanceof v?n.push(a):n.push(new v("core","Core Daily Notes settings could not be read safely."))}}catch{n.push(new v("core","Core Daily Notes provider shape is unavailable or unsupported."))}try{let r=C(e.plugins)?e.plugins:void 0,i=r&&typeof r.getPlugin=="function"?r.getPlugin.bind(r):void 0;if(!i)return{candidates:t,errors:[...n,new v("periodic","Periodic Notes provider shape is unavailable or unsupported.")]};let a=i?.("periodic-notes");if(a!==void 0){if(!C(a)||!C(a.settings)||!C(a.settings.daily))n.push(new v("periodic","Periodic Notes daily settings are unavailable or unsupported."));else if(a.settings.daily.enabled===!0)try{t.push({kind:"periodic",settings:Je(a.settings.daily,"periodic")})}catch(s){s instanceof v?n.push(s):n.push(new v("periodic","Periodic Notes daily settings could not be read safely."))}}}catch{n.push(new v("periodic","Periodic Notes provider shape is unavailable or unsupported."))}return{candidates:t,errors:n}}function se(e,t,n,r,i=[]){let a=[];for(let o of t)try{let l=Ue(e,o.settings,n,void 0,r);a.push({...o,targetDate:l})}catch{}if(!a.length){let o=i.length?` ${i.map(l=>l.message).join(" ")}`:"";throw new T(`The active note does not match configured Daily Notes or Periodic Notes settings.${o} Open a configured Daily Note or check those settings.`)}if(new Set(a.map(o=>o.targetDate)).size>1)throw new T("The active note matches multiple Daily Notes configurations with different dates; import is ambiguous.");return a.find(o=>o.kind==="core")??a[0]}function Ze(e,t){if(e.kind!==t.kind||e.targetDate!==t.targetDate||(e.settings.folder??"")!==(t.settings.folder??"")||(e.settings.format??"")!==(t.settings.format??"")||(e.settings.template??"")!==(t.settings.template??""))throw new p("The Daily Note provider or configuration changed; import aborted before writing.")}var L=class extends Error{constructor(t){super(t),this.name="CalendarInsertionError"}};function oe(e,t){try{return Ne(e,t)}catch(n){throw n instanceof m?new L(`${n.message}; import aborted without changing the note.`):n}}var W=class extends u.Plugin{constructor(){super(...arguments);this.settings={...b};this.excludedVaultFoldersPersistedInvalid=!1;this.selectedCalendarIdsPersistedInvalid=!1}async onload(){await this.loadSettings(),this.addCommand({id:"import-calendar-events-into-active-daily-note",name:"Import Calendar events into active Daily Note",callback:()=>{this.importIntoActiveDailyNote()}}),this.addSettingTab(new le(this.app,this))}async loadSettings(){let n=await this.loadData(),r=We(n);this.excludedVaultFoldersPersistedInvalid=r.excludedVaultFolders.malformed,this.excludedVaultFoldersInput=r.excludedVaultFolders.rawInput,this.selectedCalendarIdsPersistedInvalid=r.selectedCalendarIds.malformed,this.selectedCalendarIdsInput=r.selectedCalendarIds.rawInput,this.settings={excludedVaultFolders:r.excludedVaultFolders.folders,selectedCalendarIds:r.selectedCalendarIds.ids,insertionMode:r.insertionMode,insertionHeading:r.insertionHeading,eventHeadingLevel:r.eventHeadingLevel,timeFormat:r.timeFormat,linkMatchingVaultNotes:r.linkMatchingVaultNotes,linkEventTitles:r.linkEventTitles}}async saveSettings(){let n=Ye(this.settings.excludedVaultFolders),r=_e(this.settings.selectedCalendarIds),i=B(this.settings.eventHeadingLevel);if(!i)throw new Error("Event heading level must be Heading 3 through Heading 6.");let a=_(this.settings.timeFormat);if(!a)throw new Error("Time format must be 24-hour or 12-hour.");if(typeof this.settings.linkMatchingVaultNotes!="boolean"||typeof this.settings.linkEventTitles!="boolean")throw new Error("Linking settings must be enabled or disabled.");this.settings={excludedVaultFolders:n,selectedCalendarIds:r,insertionMode:"heading",insertionHeading:"# Notes",eventHeadingLevel:i,timeFormat:a,linkMatchingVaultNotes:I(this.settings.linkMatchingVaultNotes,b.linkMatchingVaultNotes),linkEventTitles:I(this.settings.linkEventTitles,b.linkEventTitles)};let s={...this.settings,...this.excludedVaultFoldersPersistedInvalid?{excludedVaultFolders:this.excludedVaultFoldersInput??""}:{},...this.selectedCalendarIdsPersistedInvalid?{selectedCalendarIds:this.selectedCalendarIdsInput}:{}};await this.saveData(s)}activeMarkdownEditor(n){let r=this.app.workspace.getActiveViewOfType(u.MarkdownView);return!r?.editor||!r.file||r.file.path!==n.path?null:r.editor}replaceEditorContent(n,r,i){if(r===i)return;let a=0;for(;a<r.length&&a<i.length&&r[a]===i[a];)a+=1;let s=0;for(;s<r.length-a&&s<i.length-a&&r[r.length-s-1]===i[i.length-s-1];)s+=1;let o=n.offsetToPos(a),l=n.offsetToPos(r.length-s);n.replaceRange(i.slice(a,i.length-s),o,l,"calendar-daily-note-linker")}async importIntoActiveDailyNote(){let n=new u.Notice("Checking the active Daily Note\u2026",0),r=i=>{n.setMessage(i),window.setTimeout(()=>n.hide(),1e4)};try{if(process.platform!=="darwin")throw new Error("Calendar Daily Note Linker requires macOS desktop and Calendar access.");let i=this.app.workspace.getActiveFile();if(!i||i.extension.toLowerCase()!=="md")throw new p("Open an existing configured Daily Note before running this command.");if(this.settings.linkMatchingVaultNotes&&this.excludedVaultFoldersPersistedInvalid)throw new Error("Saved vault folder exclusions are invalid. Correct them in settings before importing Calendar events.");if(this.selectedCalendarIdsPersistedInvalid)throw new Error("Saved Calendar selection is invalid. Correct it in settings before importing Calendar events.");let a=(y,w)=>(0,u.moment)(y,w,!0),s=y=>(0,u.moment)(y,"YYYY-MM-DD",!0),o=ae(this.app),l=se(i,o.candidates,a,s,o.errors),d=l.targetDate;n.setMessage(`Reading Calendar for ${d}\u2026`);let c=await he(d,this.settings.selectedCalendarIds);c.warnings.length&&new u.Notice(`Calendar warning: ${c.warnings.join(" ")}`,8e3);let g=ve(this.settings.linkMatchingVaultNotes,()=>{n.setMessage("Matching vault notes\u2026");let y=this.app.vault.getMarkdownFiles().map(w=>({path:w.path,basename:w.basename,file:w,frontmatter:this.app.metadataCache.getFileCache(w)?.frontmatter}));return Ce(we(y,this.settings.excludedVaultFolders),w=>{if(!w.file)throw new Error(`Vault note is unavailable: ${w.path}`);return{linkText:this.app.metadataCache.fileToLinktext(w.file,i.path,!0)}})});this.settings.linkMatchingVaultNotes||n.setMessage("Skipping vault note matching\u2026");let x=ze(c,g,this.settings);n.setMessage("Writing the active Daily Note\u2026");let U=this.app.workspace.getActiveFile();if(!U||this.app.vault.getAbstractFileByPath(i.path)!==i)throw new p("The active Daily Note changed, moved, or was deleted; import aborted before writing.");let de=ae(this.app),K=se(U,de.candidates,a,s,de.errors);je(i,U,l.settings,K.settings,d,K.targetDate),Ze(l,K);let j=this.activeMarkdownEditor(i);if(j){let y=j.getValue(),w=oe(y,x.block);this.replaceEditorContent(j,y,w)}else await this.app.vault.process(i,y=>oe(y,x.block));r(Ge(d,i.basename,x.eventCount,x.linkCount,this.settings))}catch(i){let a=i instanceof h||i instanceof T||i instanceof p||i instanceof L?i.message:`Could not import Calendar events: ${i instanceof Error?i.message:String(i)}`;r(a)}}},le=class extends u.PluginSettingTab{constructor(n,r){super(n,r);this.calendarLoadInFlight=!1;this.plugin=r}display(){let{containerEl:n}=this;if(n.empty(),n.createEl("h2",{text:"Calendar Daily Note Linker"}),this.plugin.excludedVaultFoldersPersistedInvalid&&n.createEl("p",{text:"Saved vault folder exclusions are invalid; correct them before importing Calendar events."}),this.plugin.selectedCalendarIdsPersistedInvalid&&n.createEl("p",{text:"Saved Calendar selection is invalid; choose a Calendar scope before importing events."}),n.createEl("h3",{text:"Calendars"}),new u.Setting(n).setName("Sync all calendars").setDesc("When enabled, imports events from every Calendar available to macOS.").addToggle(r=>{r.setValue(this.plugin.settings.selectedCalendarIds===null).onChange(i=>{this.commitCalendarScope(i)})}),new u.Setting(n).setName("Available macOS calendars").setDesc("Load or refresh Calendar names before choosing a specific set to sync.").addButton(r=>{r.setButtonText(this.calendarLoadInFlight?"Loading\u2026":"Refresh calendars").setDisabled(this.calendarLoadInFlight).onClick(()=>{this.loadCalendarOptions()})}),this.calendarLoadError)n.createEl("p",{text:`Could not load macOS calendars: ${this.calendarLoadError}`});else if(this.calendarOptions)if(this.plugin.settings.selectedCalendarIds===null)n.createEl("p",{text:"All available calendars will be imported. Turn off \u201CSync all calendars\u201D to choose individual calendars."});else if(!this.calendarOptions.length)n.createEl("p",{text:"No event calendars are available to macOS."});else{let r=new Set(this.calendarOptions.map(s=>s.id)),i=this.plugin.settings.selectedCalendarIds.filter(s=>r.has(s)),a=this.plugin.settings.selectedCalendarIds.length-i.length;for(let s of this.calendarOptions)new u.Setting(n).setName(s.title).setDesc(s.source?`Account: ${s.source}`:"Calendar account unavailable").addToggle(o=>{o.setValue(this.plugin.settings.selectedCalendarIds?.includes(s.id)??!1).onChange(l=>{this.commitCalendarEnabled(s.id,l)})});a&&n.createEl("p",{text:`${a} selected calendar${a===1?" is":"s are"} no longer available to macOS.`}),i.length||n.createEl("p",{text:"No available calendars are selected, so imports will contain no events."})}n.createEl("h3",{text:"Formatting"}),new u.Setting(n).setName("Event heading level").setDesc("Each event title is rendered as a Markdown heading.").addDropdown(r=>{for(let i of[3,4,5,6])r.addOption(String(i),`Heading ${i}`);r.setValue(String(this.plugin.settings.eventHeadingLevel)).onChange(i=>{this.commitEventHeadingLevel(r,i)})}),new u.Setting(n).setName("Time format").setDesc("Timed events use the Calendar event's local timezone.").addDropdown(r=>{r.addOption("24-hour","24-hour \u2014 09:00 \u2013 09:30").addOption("12-hour","12-hour \u2014 9:00 AM \u2013 9:30 AM").setValue(this.plugin.settings.timeFormat).onChange(i=>{this.commitTimeFormat(r,i)})}),new u.Setting(n).setName("Link matching vault notes").setDesc("Add deterministic vault links for uniquely matched attendee names that appear in event titles.").addToggle(r=>{r.setValue(this.plugin.settings.linkMatchingVaultNotes).onChange(i=>{this.commitBoolean(r,"linkMatchingVaultNotes",i)})}),new u.Setting(n).setName("Link event titles to Calendar").setDesc("Link event titles to Calendar when available; with an in-title vault link, add a separate Calendar link on the same line.").addToggle(r=>{r.setValue(this.plugin.settings.linkEventTitles).onChange(i=>{this.commitBoolean(r,"linkEventTitles",i)})}),n.createEl("h3",{text:"Vault matching"}),new u.Setting(n).setName("Vault folders to exclude").setDesc("Optional vault-relative folders to skip when matching Calendar attendees; one path per line; exclusions include subfolders; blank searches all Markdown notes.").addTextArea(r=>{r.setPlaceholder(`Archive
Templates
Private/People`).setValue(this.plugin.excludedVaultFoldersInput??this.plugin.settings.excludedVaultFolders.join(`
`)),r.inputEl.addEventListener("blur",()=>{this.commitExcludedVaultFolders(r)})}),n.createEl("p",{text:"Open an existing configured Daily Note, then run the command; it updates that open note for its date and replaces the visible ## Calendar section under # Notes."})}async loadCalendarOptions(){if(!this.calendarLoadInFlight){this.calendarLoadInFlight=!0,this.calendarLoadError=void 0,this.display();try{if(process.platform!=="darwin")throw new Error("Calendar selection requires macOS desktop.");this.calendarOptions=await me()}catch(n){this.calendarOptions=void 0,this.calendarLoadError=n instanceof Error?n.message:String(n)}finally{this.calendarLoadInFlight=!1,this.display()}}}async commitCalendarScope(n){let r=this.plugin.settings.selectedCalendarIds,i=this.plugin.selectedCalendarIdsPersistedInvalid;this.plugin.settings.selectedCalendarIds=n?null:[],this.plugin.selectedCalendarIdsPersistedInvalid=!1;try{await this.plugin.saveSettings(),this.display()}catch(a){this.plugin.settings.selectedCalendarIds=r,this.plugin.selectedCalendarIdsPersistedInvalid=i,this.display(),new u.Notice(`Could not save Calendar selection: ${a instanceof Error?a.message:String(a)}`)}}async commitCalendarEnabled(n,r){let i=this.plugin.settings.selectedCalendarIds,a=this.plugin.selectedCalendarIdsPersistedInvalid,s=new Set(i??[]);r?s.add(n):s.delete(n),this.plugin.settings.selectedCalendarIds=[...s],this.plugin.selectedCalendarIdsPersistedInvalid=!1;try{await this.plugin.saveSettings(),this.display()}catch(o){this.plugin.settings.selectedCalendarIds=i,this.plugin.selectedCalendarIdsPersistedInvalid=a,this.display(),new u.Notice(`Could not save Calendar selection: ${o instanceof Error?o.message:String(o)}`)}}async commitEventHeadingLevel(n,r){let i=this.plugin.settings.eventHeadingLevel,a=B(r);if(!a){n.setValue(String(i)),new u.Notice("Choose an event heading level from Heading 3 through Heading 6.");return}this.plugin.settings.eventHeadingLevel=a;try{await this.plugin.saveSettings()}catch(s){this.plugin.settings.eventHeadingLevel=i,n.setValue(String(i)),new u.Notice(`Could not save the Event heading level: ${s instanceof Error?s.message:String(s)}`)}}async commitTimeFormat(n,r){let i=this.plugin.settings.timeFormat,a=_(r);if(!a){n.setValue(i),new u.Notice("Choose 24-hour or 12-hour time format.");return}this.plugin.settings.timeFormat=a;try{await this.plugin.saveSettings()}catch(s){this.plugin.settings.timeFormat=i,n.setValue(i),new u.Notice(`Could not save the Time format: ${s instanceof Error?s.message:String(s)}`)}}async commitBoolean(n,r,i){let a=this.plugin.settings[r];this.plugin.settings[r]=i;try{await this.plugin.saveSettings()}catch(s){this.plugin.settings[r]=a,n.setValue(a),new u.Notice(`Could not save linking setting: ${s instanceof Error?s.message:String(s)}`)}}async commitExcludedVaultFolders(n){let r=[...this.plugin.settings.excludedVaultFolders],i=this.plugin.excludedVaultFoldersPersistedInvalid,a=this.plugin.excludedVaultFoldersInput,s=Y(n.getValue());if(!s){this.plugin.excludedVaultFoldersPersistedInvalid||n.setValue(r.join(`
`)),new u.Notice("Use one safe vault-relative folder per line, or leave the field blank.");return}this.plugin.settings.excludedVaultFolders=s,this.plugin.excludedVaultFoldersPersistedInvalid=!1,this.plugin.excludedVaultFoldersInput=void 0,n.setValue(s.join(`
`));try{await this.plugin.saveSettings()}catch(o){this.plugin.settings.excludedVaultFolders=r,this.plugin.excludedVaultFoldersPersistedInvalid=i,this.plugin.excludedVaultFoldersInput=a,n.setValue(i?a??"":r.join(`
`)),new u.Notice(`Could not save excluded folders: ${o instanceof Error?o.message:String(o)}`)}}};
