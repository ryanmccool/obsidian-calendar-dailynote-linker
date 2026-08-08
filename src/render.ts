import { matchAttendee, normalizeCaseFold, normalizeName } from "./invitees";
import { makeCalendarBlock, sanitizePlainExternalText } from "./block";
import type { PeopleIndex, PersonLinkTarget } from "./invitees";
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

interface NormalizedTitle {
  value: string;
  starts: number[];
  ends: number[];
}

interface TitleLinkSource {
  target: PersonLinkTarget;
  names: string[];
}

interface AttendeeTitleLinkSource {
  target: PersonLinkTarget;
  fullNames: string[];
  shortName: string | null;
}

interface TitleNameMatch {
  start: number;
  end: number;
  normalizedLength: number;
  target: PersonLinkTarget;
}

interface GraphemeSegment {
  index: number;
  segment: string;
}

interface GraphemeSegmenter {
  segment(value: string): Iterable<GraphemeSegment>;
}

type GraphemeSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" }
) => GraphemeSegmenter;

function graphemeSegments(value: string): GraphemeSegment[] {
  const Segmenter = (Intl as unknown as { Segmenter?: GraphemeSegmenterConstructor }).Segmenter;
  if (Segmenter) return [...new Segmenter(undefined, { granularity: "grapheme" }).segment(value)];

  const segments: GraphemeSegment[] = [];
  let index = 0;
  for (const character of value) {
    const start = index;
    index += character.length;
    let segment = character;
    while (index < value.length) {
      const codePoint = value.codePointAt(index);
      if (codePoint === undefined) break;
      const next = String.fromCodePoint(codePoint);
      if (!/[\p{M}\u200d\ufe0e\ufe0f]/u.test(next) && !segment.endsWith("\u200d")) break;
      segment += next;
      index += next.length;
    }
    segments.push({ index: start, segment });
  }
  return segments;
}

function normalizeTitleWithSpans(value: string): NormalizedTitle {
  const characters: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let whitespaceStart: number | undefined;
  let whitespaceEnd: number | undefined;
  const append = (character: string, start: number, end: number): void => {
    characters.push(character);
    for (let index = 0; index < character.length; index += 1) {
      starts.push(start);
      ends.push(end);
    }
  };

  for (const grapheme of graphemeSegments(value)) {
    const normalized = normalizeCaseFold(grapheme.segment);
    const end = grapheme.index + grapheme.segment.length;
    if (/^\s+$/u.test(normalized)) {
      whitespaceStart ??= grapheme.index;
      whitespaceEnd = end;
      continue;
    }
    if (characters.length > 0 && whitespaceStart !== undefined && whitespaceEnd !== undefined) {
      append(" ", whitespaceStart, whitespaceEnd);
    }
    whitespaceStart = undefined;
    whitespaceEnd = undefined;
    append(normalized, grapheme.index, end);
  }

  return { value: characters.join(""), starts, ends };
}

function isNameCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}\p{M}_]/u.test(value);
}

function codePointBefore(value: string, boundary: number): string | undefined {
  if (boundary <= 0) return undefined;
  let start = boundary - 1;
  const codeUnit = value.charCodeAt(start);
  if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff && start > 0) start -= 1;
  const codePoint = value.codePointAt(start);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

function codePointAt(value: string, index: number): string | undefined {
  const codePoint = value.codePointAt(index);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

const SHORT_NAME_STOPWORDS = new Set([
  "a", "an", "and", "at", "by", "dr", "for", "from", "in", "mr", "mrs", "ms", "of", "on", "or", "prof", "the", "to", "with"
]);

function firstLexicalToken(name: string | null | undefined): string | null {
  const normalized = name ? normalizeName(name) : "";
  if (!normalized || normalized.includes(",")) return null;
  const token = normalized.match(/[\p{L}\p{N}\p{M}]+(?:['-][\p{L}\p{N}\p{M}]+)*/u)?.[0] ?? "";
  if (!token || [...token].length < 2 || /^\p{N}+$/u.test(token) || SHORT_NAME_STOPWORDS.has(token)) return null;
  return token;
}

function addFullName(source: AttendeeTitleLinkSource, name: string | null | undefined): void {
  const normalized = name ? normalizeName(name) : "";
  if (normalized && !source.fullNames.includes(normalized)) source.fullNames.push(normalized);
}

function attendeeTitleLinkSources(
  people: PeopleIndex,
  attendees: CalendarEvent["attendees"]
): TitleLinkSource[] {
  const byPath = new Map<string, AttendeeTitleLinkSource>();

  for (const attendee of attendees) {
    const matched = matchAttendee(people, attendee);
    if (!matched || !matched.linkText) continue;
    const source = byPath.get(matched.path) ?? { target: matched, fullNames: [], shortName: null };
    addFullName(source, attendee.displayName);
    addFullName(source, source.target.basename);
    source.shortName ??= firstLexicalToken(attendee.displayName) ?? firstLexicalToken(source.target.basename);
    byPath.set(matched.path, source);
  }

  const candidateOwners = new Map<string, Set<string>>();
  for (const source of byPath.values()) {
    const names = source.shortName ? [...source.fullNames, source.shortName] : source.fullNames;
    for (const name of names) {
      const owners = candidateOwners.get(name) ?? new Set<string>();
      owners.add(source.target.path);
      candidateOwners.set(name, owners);
    }
  }

  return [...byPath.values()].map((source) => {
    const names = source.fullNames.filter((name) => candidateOwners.get(name)?.size === 1);
    if (source.shortName && candidateOwners.get(source.shortName)?.size === 1 && !names.includes(source.shortName)) {
      names.push(source.shortName);
    }
    return { target: source.target, names };
  });
}

function findTitleNameMatches(title: string, sources: readonly TitleLinkSource[]): TitleNameMatch[] {
  if (!sources.some((source) => source.names.length > 0 && Boolean(source.target.linkText))) return [];
  const normalizedTitle = normalizeTitleWithSpans(title);
  const matches: TitleNameMatch[] = [];
  for (const source of sources) {
    if (!source.target.linkText) continue;
    for (const candidate of source.names) {
      let from = 0;
      while (from < normalizedTitle.value.length) {
        const start = normalizedTitle.value.indexOf(candidate, from);
        if (start < 0) break;
        const endIndex = start + candidate.length;
        if (!isNameCharacter(codePointBefore(normalizedTitle.value, start)) && !isNameCharacter(codePointAt(normalizedTitle.value, endIndex))) {
          let sourceStart = normalizedTitle.starts[start];
          let sourceEnd = normalizedTitle.ends[start];
          for (let index = start + 1; index < endIndex; index += 1) {
            sourceStart = Math.min(sourceStart, normalizedTitle.starts[index]);
            sourceEnd = Math.max(sourceEnd, normalizedTitle.ends[index]);
          }
          matches.push({
            start: sourceStart,
            end: sourceEnd,
            normalizedLength: candidate.length,
            target: source.target
          });
        }
        from = start + 1;
      }
    }
  }

  matches.sort((left, right) => {
    if (left.normalizedLength !== right.normalizedLength) return right.normalizedLength - left.normalizedLength;
    if (left.start !== right.start) return left.start - right.start;
    return right.end - left.end;
  });

  const selected: TitleNameMatch[] = [];
  for (const match of matches) {
    if (selected.some((selectedMatch) => match.start < selectedMatch.end && selectedMatch.start < match.end)) continue;
    selected.push(match);
  }
  return selected.sort((left, right) => left.start - right.start);
}

function escapeWikilinkDestination(value: string): string {
  return value
    .replaceAll("<!-- calendar-daily-note-linker:start -->", "[calendar section start]")
    .replaceAll("<!-- calendar-daily-note-linker:end -->", "[calendar section end]")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("]", "\\]");
}

function wikilinkWithDisplay(target: PersonLinkTarget, display: string, sanitizeTitle: (value: string) => string): string | null {
  if (!target.linkText) return null;
  return `[[${escapeWikilinkDestination(target.linkText)}|${sanitizeTitle(display)}]]`;
}

function renderTitleWithPeople(
  title: string,
  sources: readonly TitleLinkSource[],
  sanitizeTitle: (value: string) => string
): { title: string; linkCount: number } {
  const matches = findTitleNameMatches(title, sources);
  let rendered = "";
  let last = 0;
  let linkCount = 0;
  for (const match of matches) {
    const link = wikilinkWithDisplay(match.target, title.slice(match.start, match.end), sanitizeTitle);
    if (!link) continue;
    rendered += sanitizeTitle(title.slice(last, match.start));
    rendered += link;
    last = match.end;
    linkCount += 1;
  }
  rendered += sanitizeTitle(title.slice(last));
  return { title: rendered, linkCount };
}

function renderEventTitle(
  event: CalendarEvent,
  people: PeopleIndex,
  linkMatchingVaultNotes: boolean,
  sanitizeTitle: (value: string) => string
): { title: string; linkCount: number } {
  if (!linkMatchingVaultNotes) return { title: sanitizeTitle(event.title), linkCount: 0 };
  return renderTitleWithPeople(event.title, attendeeTitleLinkSources(people, event.attendees), sanitizeTitle);
}

function renderTitleWithCalendarUrl(
  renderedTitle: { title: string; linkCount: number },
  eventUrl: string | null
): string {
  if (!eventUrl) return renderedTitle.title;
  const calendarLink = `[Calendar](${escapeMarkdownLinkUrl(eventUrl)})`;
  return renderedTitle.linkCount > 0
    ? `${renderedTitle.title} · ${calendarLink}`
    : `[${renderedTitle.title}](${escapeMarkdownLinkUrl(eventUrl)})`;
}

function renderEvent(
  event: CalendarEvent,
  payload: CalendarPayload,
  people: PeopleIndex,
  options: CalendarRenderOptions
): RenderedEvent {
  const eventUrl = options.linkEventTitles ? httpUrl(event.url) : null;
  const renderedTitle = renderEventTitle(event, people, options.linkMatchingVaultNotes, sanitizeEventHeadingTitle);
  const title = renderTitleWithCalendarUrl(renderedTitle, eventUrl);
  const heading = `${"#".repeat(options.eventHeadingLevel)} ${title}`;
  const when = event.allDay
    ? "All day"
    : `${formatLocalTime(event.start, payload.range.timeZone, options.timeFormat)} – ${formatLocalTime(event.end, payload.range.timeZone, options.timeFormat)}`;
  return { lines: [heading, when], linkCount: renderedTitle.linkCount };
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
      const renderedTitle = renderEventTitle(event, people, true, sanitizePlainExternalText);
      const title = renderTitleWithCalendarUrl(renderedTitle, eventUrl);
      const when = event.allDay
        ? "All day"
        : `${formatLocalTime(event.start, payload.range.timeZone, "12-hour")}–${formatLocalTime(event.end, payload.range.timeZone, "12-hour")}`;
      lines.push(title);
      lines.push(when);
      linkCount += renderedTitle.linkCount;
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
