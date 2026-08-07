/*
 * Fixed JXA bridge for Calendar.app.
 * The last expression returned by main() is the only stdout produced by this script.
 */

function readEventProperty(object, propertyName) {
  if (!object) throw new Error("Calendar property " + propertyName + " had no object.");
  try {
    var value = object[propertyName];
    return typeof value === "function" ? value.call(object) : value;
  } catch (error) {
    throw new Error("Calendar property " + propertyName + " could not be read.");
  }
}

function readOptionalAttendeeProperty(object, propertyName) {
  try {
    if (!object) return { available: false, value: null };
    var value = object[propertyName];
    value = typeof value === "function" ? value.call(object) : value;
    return { available: value !== undefined, value: value === undefined ? null : value };
  } catch (error) {
    return { available: false, value: null };
  }
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  var text = String(value);
  return text.length ? text : null;
}

function dateOrNull(value) {
  if (!value) return null;
  var date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function warningOnce(warnings, message) {
  if (warnings.indexOf(message) === -1) warnings.push(message);
}

function attendeeValue(attendee, propertyName, warningLabel, warnings) {
  var result = readOptionalAttendeeProperty(attendee, propertyName);
  if (!result.available) {
    warningOnce(warnings, "Calendar attendee " + warningLabel + " data is unavailable on this macOS/source.");
    return null;
  }
  return stringOrNull(result.value);
}

function readAttendees(event, warnings) {
  var rawAttendees;
  try {
    var attendeeResult = readOptionalAttendeeProperty(event, "attendees");
    if (!attendeeResult.available) rawAttendees = undefined;
    else rawAttendees = attendeeResult.value;
  } catch (error) {
    rawAttendees = undefined;
  }
  if (rawAttendees === undefined) {
    warningOnce(warnings, "Calendar attendee data is unavailable on this macOS/source.");
    return [];
  }
  if (rawAttendees === null) return [];
  if (!Array.isArray(rawAttendees)) {
    warningOnce(warnings, "Calendar attendee data is unavailable on this macOS/source.");
    return [];
  }

  var attendees = [];
  try {
    for (var index = 0; index < rawAttendees.length; index += 1) {
      var attendee = rawAttendees[index];
      attendees.push({
        displayName: attendeeValue(attendee, "displayName", "display name", warnings),
        email: attendeeValue(attendee, "email", "email", warnings),
        status: attendeeValue(attendee, "participationStatus", "participation status", warnings)
      });
    }
  } catch (error) {
    warningOnce(warnings, "Some Calendar attendee data is unavailable on this macOS/source.");
  }
  return attendees;
}

function calendarName(event) {
  var calendar = readEventProperty(event, "calendar");
  return calendar === null ? null : stringOrNull(readEventProperty(calendar, "title"));
}

function main() {
  var Calendar = Application("Calendar");
  var warnings = [];
  var now = new Date();
  function pad(number) {
    return number < 10 ? "0" + number : String(number);
  }
  var targetDate = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  var rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  var rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  var timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  var events = [];

  var calendars = Calendar.calendars();
  if (!Array.isArray(calendars)) throw new Error("Calendar calendars could not be enumerated.");
  for (var calendarIndex = 0; calendarIndex < calendars.length; calendarIndex += 1) {
    var calendar = calendars[calendarIndex];
    var calendarEvents;
    try {
      calendarEvents = calendar.events.whose({
        startDate: { _lessThan: rangeEnd },
        endDate: { _greaterThan: rangeStart }
      })();
    } catch (error) {
      throw new Error("Calendar events could not be enumerated.");
    }
    if (!Array.isArray(calendarEvents)) throw new Error("Calendar events could not be enumerated.");

    for (var eventIndex = 0; eventIndex < calendarEvents.length; eventIndex += 1) {
      var event = calendarEvents[eventIndex];
      var start = dateOrNull(readEventProperty(event, "startDate"));
      var end = dateOrNull(readEventProperty(event, "endDate"));
      if (!start || !end) {
        throw new Error("A Calendar event did not provide valid dates.");
      }
      if (start >= rangeEnd || end <= rangeStart) continue;

      var allDay = readEventProperty(event, "alldayEvent");
      if (typeof allDay !== "boolean") throw new Error("Calendar event all-day value was not boolean.");
      events.push({
        id: stringOrNull(readEventProperty(event, "uid")),
        calendar: calendarName(event),
        title: stringOrNull(readEventProperty(event, "summary")) || "(Untitled event)",
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: Boolean(allDay),
        url: stringOrNull(readEventProperty(event, "url")),
        location: stringOrNull(readEventProperty(event, "location")),
        notes: null,
        attendees: readAttendees(event, warnings)
      });
    }
  }

  return JSON.stringify({
    schemaVersion: 1,
    source: "Calendar.app",
    targetDate: targetDate,
    range: {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString(),
      timeZone: timeZone
    },
    events: events,
    warnings: warnings
  });
}

main();
