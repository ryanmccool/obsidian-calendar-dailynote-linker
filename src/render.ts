import { matchEventPeople } from "./invitees";
import { makeCalendarBlock, sanitizePlainExternalText } from "./block";
import type { PeopleIndex } from "./invitees";
import type { CalendarEvent, CalendarPayload } from "./types";
import type { EventHeadingLevel, TimeFormat } from "./settings";

export interface CalendarRenderOptions {
  eventHeadingLevel: EventHeadingLevel;
  timeFormat: TimeFormat;
  linkMatchingVaultNotes: boolean;
  linkEventTitles: boolean;
}

export const DEFAULT_RENDER_OPTIONS: CalendarRenderOptions = {
  eventHeadingLevel: 2,
  timeFormat: "24-hour",
  linkMatchingVaultNotes: true,
  linkEventTitles: true
};

export function escapeMarkdownLinkUrl(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/[\s<>]/gu, (character) => encodeURIComponent(character))
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("\"", "%22");
}

function httpUrl(value: string | null): string | null {
  if (!value?.trim()) return null;
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) return null;
  if (value.includes("<!-- calendar-daily-note-linker:start -->") || value.includes("<!-- calendar-daily-note-linker:end -->")) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function eventSort(left: CalendarEvent, right: CalendarEvent): number {
  if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
  const byStart = Date.parse(left.start) - Date.parse(right.start);
  if (byStart !== 0) return byStart;
  const byEnd = Date.parse(left.end) - Date.parse(right.end);
  if (byEnd !== 0) return byEnd;
  return left.title.localeCompare(right.title);
}

export function formatLocalTime(
  isoDate: string,
  timeZone: string,
  timeFormat: TimeFormat = "24-hour"
): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: timeFormat === "12-hour",
    ...(timeFormat === "24-hour" ? { hourCycle: "h23" } : {})
  };
  try {
    return new Intl.DateTimeFormat("en-US", options).format(new Date(isoDate));
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: undefined }).format(new Date(isoDate));
  }
}

interface RenderedEvent {
  lines: [string, string];
  linkCount: number;
}

function sanitizeEventHeadingTitle(value: string): string {
  // A hyphen is ordinary heading text (and is part of common event names), so
  // keep it readable while retaining the stricter escaping for other syntax.
  return sanitizePlainExternalText(value).replaceAll("\\-", "-");
}

function renderEvent(
  event: CalendarEvent,
  payload: CalendarPayload,
  people: PeopleIndex,
  options: CalendarRenderOptions
): RenderedEvent {
  const eventUrl = options.linkEventTitles ? httpUrl(event.url) : null;
  const plainTitle = sanitizeEventHeadingTitle(event.title);
  const title = eventUrl
    ? `[${plainTitle}](${escapeMarkdownLinkUrl(eventUrl)})`
    : plainTitle;
  const matchedPeople = options.linkMatchingVaultNotes
    ? matchEventPeople(people, event.attendees, event.title)
    : [];
  const peopleLinks = matchedPeople
    .map((person) => person.markdownLink)
    .filter((link): link is string => Boolean(link));
  const heading = `${"#".repeat(options.eventHeadingLevel)} ${title}${peopleLinks.length ? ` — ${peopleLinks.join(", ")}` : ""}`;
  const when = event.allDay
    ? "All day"
    : `${formatLocalTime(event.start, payload.range.timeZone, options.timeFormat)} – ${formatLocalTime(event.end, payload.range.timeZone, options.timeFormat)}`;
  return { lines: [heading, when], linkCount: peopleLinks.length };
}

export interface CalendarRenderResult {
  block: string;
  eventCount: number;
  linkCount: number;
}

function renderModernCalendarBlock(
  payload: CalendarPayload,
  people: PeopleIndex,
  options: CalendarRenderOptions
): CalendarRenderResult {
  const lines: string[] = [];
  const events = [...payload.events].sort(eventSort);
  let linkCount = 0;
  if (!events.length) {
    lines.push(`No Calendar events found for ${payload.targetDate}.`);
  } else {
    for (const event of events) {
      const rendered = renderEvent(event, payload, people, options);
      lines.push(...rendered.lines);
      linkCount += rendered.linkCount;
    }
  }
  return { block: makeCalendarBlock(lines), eventCount: events.length, linkCount };
}

// The string-heading overload is retained for source compatibility with 0.2.x
// consumers. The plugin and the new overload below always use the 0.3 format.
function renderLegacyCalendarBlock(
  payload: CalendarPayload,
  heading: string,
  people: PeopleIndex
): CalendarRenderResult {
  const lines = [heading];
  const events = [...payload.events].sort(eventSort);
  let linkCount = 0;
  if (!events.length) {
    lines.push(`No Calendar events found for ${payload.targetDate}.`);
  } else {
    for (const event of events) {
      const eventUrl = httpUrl(event.url);
      const title = eventUrl
        ? `[${sanitizePlainExternalText(event.title)}](${escapeMarkdownLinkUrl(eventUrl)})`
        : sanitizePlainExternalText(event.title);
      const peopleLinks = matchEventPeople(people, event.attendees, event.title)
        .map((person) => person.markdownLink)
        .filter((link): link is string => Boolean(link));
      const when = event.allDay
        ? "All day"
        : `${formatLocalTime(event.start, payload.range.timeZone, "12-hour")}–${formatLocalTime(event.end, payload.range.timeZone, "12-hour")}`;
      lines.push(`${title}${peopleLinks.length ? ` — ${peopleLinks.join(", ")}` : ""}`);
      lines.push(when);
      linkCount += peopleLinks.length;
    }
  }
  return { block: makeCalendarBlock(lines), eventCount: events.length, linkCount };
}

export function renderCalendarBlockWithSummary(
  payload: CalendarPayload,
  peopleOrHeading: PeopleIndex | string,
  optionsOrPeople?: Partial<CalendarRenderOptions> | PeopleIndex
): CalendarRenderResult {
  if (typeof peopleOrHeading === "string") {
    return renderLegacyCalendarBlock(payload, peopleOrHeading, optionsOrPeople as PeopleIndex);
  }
  return renderModernCalendarBlock(
    payload,
    peopleOrHeading,
    { ...DEFAULT_RENDER_OPTIONS, ...(optionsOrPeople as Partial<CalendarRenderOptions> | undefined) } as CalendarRenderOptions
  );
}

export function renderCalendarBlock(
  payload: CalendarPayload,
  peopleOrHeading: PeopleIndex | string,
  optionsOrPeople?: Partial<CalendarRenderOptions> | PeopleIndex
): string {
  return renderCalendarBlockWithSummary(payload, peopleOrHeading, optionsOrPeople).block;
}
