/*
 * Native EventKit JXA bridge.
 * JXA invokes run(argv); its return value is the only stdout produced by this script.
 */

var EVENTKIT_PERMISSION_MESSAGE = "Allow Calendar access in System Settings → Privacy & Security → Calendars.";
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
  if (typeof targetDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
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
