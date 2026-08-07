import { matchEventPeople } from "./invitees";
import { makeCalendarBlock, sanitizePlainExternalText } from "./block";
import type { PeopleIndex } from "./invitees";
import type { CalendarEvent, CalendarPayload } from "./types";

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

export function formatLocalTime(isoDate: string, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  };
  try {
    return new Intl.DateTimeFormat("en-US", options).format(new Date(isoDate));
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: undefined }).format(new Date(isoDate));
  }
}

interface RenderedEvent {
  line: string;
  linkCount: number;
}

function renderEvent(event: CalendarEvent, payload: CalendarPayload, people: PeopleIndex): RenderedEvent {
  const eventUrl = httpUrl(event.url);
  const title = eventUrl
    ? `[${sanitizePlainExternalText(event.title)}](${escapeMarkdownLinkUrl(eventUrl)})`
    : sanitizePlainExternalText(event.title);
  const matchedPeople = matchEventPeople(people, event.attendees, event.title);
  const peopleLinks = matchedPeople
    .map((person) => person.markdownLink)
    .filter((link): link is string => Boolean(link));
  const when = event.allDay
    ? "All day"
    : `${formatLocalTime(event.start, payload.range.timeZone)}–${formatLocalTime(event.end, payload.range.timeZone)}`;
  return {
    line: `- ${title}${peopleLinks.length ? ` — ${peopleLinks.join(", ")}` : ""} — ${when}`,
    linkCount: peopleLinks.length
  };
}

export interface CalendarRenderResult {
  block: string;
  eventCount: number;
  linkCount: number;
}

export function renderCalendarBlockWithSummary(
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
      const rendered = renderEvent(event, payload, people);
      lines.push(rendered.line);
      linkCount += rendered.linkCount;
    }
  }
  return { block: makeCalendarBlock(lines), eventCount: events.length, linkCount };
}

export function renderCalendarBlock(payload: CalendarPayload, heading: string, people: PeopleIndex): string {
  return renderCalendarBlockWithSummary(payload, heading, people).block;
}
