import type { CalendarAttendee, CalendarEvent, CalendarPayload } from "./types";

export class CalendarPayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarPayloadValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new CalendarPayloadValidationError(`${label} must be a string`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value !== null && typeof value !== "string") {
    throw new CalendarPayloadValidationError(`${label} must be a string or null`);
  }
  return value;
}

function validIsoDate(value: unknown, label: string): string {
  const date = requiredString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new CalendarPayloadValidationError(`${label} must be a valid ISO date`);
  }
  return date;
}

function validTargetDate(value: unknown): string {
  const targetDate = requiredString(value, "targetDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new CalendarPayloadValidationError("targetDate must be YYYY-MM-DD");
  }
  const [year, month, day] = targetDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new CalendarPayloadValidationError("targetDate must be a valid calendar date");
  }
  return targetDate;
}

function isOptionalAttendeeWarning(value: string): boolean {
  return /^(?:Calendar attendee|Some Calendar attendee).*unavailable on this macOS\/source\.$/.test(value);
}

function parseAttendee(value: unknown, index: number): CalendarAttendee {
  if (!isRecord(value)) {
    throw new CalendarPayloadValidationError(`events attendee ${index} must be an object`);
  }
  return {
    displayName: nullableString(value.displayName, `attendee ${index} displayName`),
    email: nullableString(value.email, `attendee ${index} email`),
    status: nullableString(value.status, `attendee ${index} status`)
  };
}

function parseEvent(value: unknown, index: number): CalendarEvent {
  if (!isRecord(value)) {
    throw new CalendarPayloadValidationError(`event ${index} must be an object`);
  }
  const attendees = value.attendees;
  if (!Array.isArray(attendees)) {
    throw new CalendarPayloadValidationError(`event ${index} attendees must be an array`);
  }
  const start = validIsoDate(value.start, `event ${index} start`);
  const end = validIsoDate(value.end, `event ${index} end`);
  if (Date.parse(end) < Date.parse(start)) {
    throw new CalendarPayloadValidationError(`event ${index} end cannot precede start`);
  }
  if (typeof value.allDay !== "boolean") {
    throw new CalendarPayloadValidationError(`event ${index} allDay must be a boolean`);
  }
  return {
    id: nullableString(value.id, `event ${index} id`),
    calendar: nullableString(value.calendar, `event ${index} calendar`),
    title: requiredString(value.title, `event ${index} title`),
    start,
    end,
    allDay: value.allDay,
    url: nullableString(value.url, `event ${index} url`),
    location: nullableString(value.location, `event ${index} location`),
    notes: value.notes === null ? null : (() => {
      throw new CalendarPayloadValidationError(`event ${index} notes must be null`);
    })(),
    attendees: attendees.map((attendee, attendeeIndex) => parseAttendee(attendee, attendeeIndex))
  };
}

export function parseCalendarPayloadJson(json: string): CalendarPayload {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new CalendarPayloadValidationError("Calendar bridge output was not valid JSON");
  }
  return validateCalendarPayload(value);
}

export function validateCalendarPayload(value: unknown): CalendarPayload {
  if (!isRecord(value)) {
    throw new CalendarPayloadValidationError("Calendar bridge output must be a JSON object");
  }
  if (value.schemaVersion !== 1) {
    throw new CalendarPayloadValidationError("Calendar bridge output has an unsupported schema version");
  }
  if (!isRecord(value.range)) {
    throw new CalendarPayloadValidationError("Calendar bridge output range must be an object");
  }
  const start = validIsoDate(value.range.start, "range start");
  const end = validIsoDate(value.range.end, "range end");
  if (Date.parse(end) <= Date.parse(start)) {
    throw new CalendarPayloadValidationError("range end must be after range start");
  }
  const timeZone = requiredString(value.range.timeZone, "range timeZone").trim();
  if (!timeZone) {
    throw new CalendarPayloadValidationError("range timeZone cannot be empty");
  }
  if (!Array.isArray(value.events)) {
    throw new CalendarPayloadValidationError("Calendar bridge output events must be an array");
  }
  if (!Array.isArray(value.warnings) || value.warnings.some((warning) => typeof warning !== "string")) {
    throw new CalendarPayloadValidationError("Calendar bridge output warnings must be an array of strings");
  }
  const warnings = value.warnings as string[];
  return {
    schemaVersion: 1,
    source: requiredString(value.source, "source"),
    targetDate: validTargetDate(value.targetDate),
    range: { start, end, timeZone },
    events: value.events.map((event, index) => parseEvent(event, index)),
    warnings: warnings.map((warning) => {
      if (!isOptionalAttendeeWarning(warning)) {
        throw new CalendarPayloadValidationError("Calendar bridge warnings may only describe unavailable attendee properties");
      }
      return warning;
    })
  };
}
