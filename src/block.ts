import { parseStandaloneAtxHeadings } from "./markdown";

export const CALENDAR_START_MARKER = "<!-- calendar-daily-note-linker:start -->";
export const CALENDAR_END_MARKER = "<!-- calendar-daily-note-linker:end -->";
export const CALENDAR_SECTION_HEADING = "## Calendar";

export class CalendarBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarBlockError";
  }
}

export interface CalendarBlockRange {
  start: number;
  end: number;
}

export interface CalendarHeadingSpan extends CalendarBlockRange {
  text: string;
  contentEnd: number;
  level: number;
}

export type CalendarContentKind = "legacy-marker" | "visible-section" | "new-section";

/**
 * The read-only result used by every Calendar block operation.  Keeping the
 * destination, section boundary, newline style, and migration classification
 * together prevents the editor and vault paths from making different choices.
 */
export interface CalendarDocumentInspection {
  newline: "\n" | "\r\n";
  notes: CalendarHeadingSpan;
  notesEnd: number;
  markerRange: CalendarBlockRange | null;
  calendarSectionRange: CalendarBlockRange | null;
  legacyWrapperRange: CalendarBlockRange | null;
  kind: CalendarContentKind;
}

interface NoteLine {
  content: string;
  start: number;
  end: number;
  next: number;
}

export function makeCalendarBlock(lines: readonly string[]): string {
  return [CALENDAR_SECTION_HEADING, ...lines.map(sanitizeMarkdownLine)].join("\n");
}

/**
 * Discover and validate the unique Calendar destination without changing the
 * note.  In particular, Calendar headings inside a valid legacy marker range
 * are legacy content, not additional visible sections.
 */
export function inspectCalendarDocument(noteContent: string): CalendarDocumentInspection {
  const markerRange = findCalendarBlockRange(noteContent);
  const headings = noteHeadings(noteContent);
  const notesHeadings = headings.filter((heading) => heading.text === "# Notes");
  if (notesHeadings.length !== 1) {
    throw new CalendarBlockError("The # Notes heading was not found exactly once.");
  }

  const notes = notesHeadings[0];
  const nextLevelOne = headings.find((heading) => heading.start > notes.start && heading.level === 1);
  const notesEnd = nextLevelOne?.start ?? noteContent.length;

  const calendarHeadings = headings
    .filter((heading) => heading.text === CALENDAR_SECTION_HEADING)
    .filter((heading) => !markerRange || !isWithinRange(heading.start, markerRange));

  if (calendarHeadings.length > 1) {
    throw new CalendarBlockError("The Calendar section is duplicated.");
  }

  const calendarHeading = calendarHeadings[0];
  const calendarRange = calendarHeading ? sectionRange(noteContent, calendarHeading, headings, markerRange) : null;
  const legacyWrapperRange = markerRange && calendarHeading && calendarRange && isMarkerOnlyWrapper(noteContent, markerRange, calendarHeading, calendarRange)
    ? calendarRange
    : null;

  if (markerRange && calendarRange && rangesOverlap(markerRange, calendarRange) && !legacyWrapperRange) {
    throw new CalendarBlockError("The legacy Calendar block is inside a non-empty Calendar section.");
  }
  if (calendarHeading && !legacyWrapperRange && (calendarHeading.start < notes.contentEnd || calendarHeading.start >= notesEnd)) {
    throw new CalendarBlockError("The Calendar section is outside the # Notes section.");
  }

  return {
    newline: noteContent.includes("\r\n") ? "\r\n" : "\n",
    notes,
    notesEnd,
    markerRange,
    calendarSectionRange: calendarRange,
    legacyWrapperRange,
    kind: markerRange ? "legacy-marker" : calendarHeading ? "visible-section" : "new-section"
  };
}

/** Replace, migrate, or create the fixed visible Calendar section. */
export function replaceOrCreateCalendarSection(noteContent: string, block: string): string {
  validateGeneratedBlock(block);
  const inspection = inspectCalendarDocument(noteContent);

  if (inspection.kind === "visible-section") {
    if (!inspection.calendarSectionRange) throw new CalendarBlockError("The Calendar section boundary could not be determined.");
    return replaceRange(noteContent, inspection.calendarSectionRange, block, inspection.newline);
  }

  if (inspection.kind === "legacy-marker") {
    if (!inspection.markerRange) throw new CalendarBlockError("The legacy Calendar block range could not be determined.");
    const withoutMarker = removeRange(noteContent, inspection.markerRange);
    const withoutLegacyWrapper = inspection.legacyWrapperRange
      ? removeRange(withoutMarker, translateRangeAfterRemoval(inspection.legacyWrapperRange, inspection.markerRange))
      : withoutMarker;
    // Re-discover after removing the exact old range (and, when applicable,
    // its empty legacy wrapper) so a cursor/custom-heading migration can
    // safely reuse the fixed section or create it at the end of Notes.
    const destination = inspectCalendarDocument(withoutLegacyWrapper);
    return applyInspectedCalendarUpdate(withoutLegacyWrapper, destination, block, noteContent.endsWith("\n"));
  }

  return applyInspectedCalendarUpdate(noteContent, inspection, block, noteContent.endsWith("\n"));
}

/** The historical public replacement API now follows the visible-section migration rules. */
export function replaceCalendarBlock(noteContent: string, block: string): string {
  return replaceOrCreateCalendarSection(noteContent, block);
}

/** Find and validate the one managed legacy block, returning line-inclusive offsets. */
export function findCalendarBlockRange(noteContent: string): CalendarBlockRange | null {
  const lines = noteLines(noteContent);
  const starts: NoteLine[] = [];
  const ends: NoteLine[] = [];
  let frontmatter = lines.length > 0 && lines[0].content.replace(/^\ufeff/u, "").trim() === "---";
  let fence: { character: "`" | "~"; length: number } | null = null;

  for (const line of lines) {
    if (frontmatter) {
      if (line.start !== 0 && (line.content.trim() === "---" || line.content.trim() === "...")) frontmatter = false;
      continue;
    }

    if (fence) {
      if (closesFence(line.content, fence)) fence = null;
      continue;
    }

    const opening = fenceOpening(line.content);
    if (opening) {
      const info = line.content.replace(/^ {0,3}(`{3,}|~{3,})/u, "");
      if (opening.character === "~" || !info.includes("`")) fence = opening;
      continue;
    }

    const isStart = line.content === CALENDAR_START_MARKER;
    const isEnd = line.content === CALENDAR_END_MARKER;
    const containsMarker = line.content.includes(CALENDAR_START_MARKER) || line.content.includes(CALENDAR_END_MARKER);
    if (containsMarker && !isStart && !isEnd) {
      throw new CalendarBlockError("The Calendar section marker must be on an exact standalone line.");
    }
    if (/^(?: {4}|\t)/u.test(line.content)) continue;
    if (isStart) starts.push(line);
    if (isEnd) ends.push(line);
  }

  if (starts.length === 0 && ends.length === 0) return null;
  if (starts.length !== 1 || ends.length !== 1 || starts[0].start >= ends[0].start) {
    throw new CalendarBlockError("The Calendar section markers are duplicated, incomplete, or out of order.");
  }
  return { start: starts[0].start, end: ends[0].next };
}

export function removeCalendarBlock(noteContent: string): string {
  const range = findCalendarBlockRange(noteContent);
  return range ? removeRange(noteContent, range) : noteContent;
}

export function validateGeneratedBlock(block: string): void {
  const lines = block.split("\n").map((rawLine) => rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine);
  if (lines[0] !== CALENDAR_SECTION_HEADING) {
    throw new CalendarBlockError("Generated Calendar content must start with the ## Calendar heading.");
  }
  if (lines.some((line) => line.includes(CALENDAR_START_MARKER) || line.includes(CALENDAR_END_MARKER))) {
    throw new CalendarBlockError("Generated Calendar content must not contain legacy section markers.");
  }
  if (lines.slice(1).some((line) => /^\s{0,3}#{1,2}[ \t]+\S/u.test(line))) {
    throw new CalendarBlockError("Generated Calendar events must use Heading 3 through Heading 6.");
  }
}

export function sanitizeMarkdownLine(value: string): string {
  return value
    .replace(/\r\n?|\n|\u2028|\u2029/gu, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, "")
    .replaceAll(CALENDAR_START_MARKER, "[calendar section start]")
    .replaceAll(CALENDAR_END_MARKER, "[calendar section end]");
}

export function sanitizePlainExternalText(value: string): string {
  return sanitizeMarkdownLine(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_{}\[\]()#+\-.!|>~]/gu, "\\$&");
}

function headingLevel(text: string): number {
  return text.match(/^#+/u)?.[0].length ?? 0;
}

function noteHeadings(noteContent: string): CalendarHeadingSpan[] {
  return parseStandaloneAtxHeadings(noteContent).map((heading) => ({
    ...heading,
    end: heading.contentEnd,
    level: headingLevel(heading.text)
  }));
}

function sectionRange(
  noteContent: string,
  heading: CalendarHeadingSpan,
  headings: readonly CalendarHeadingSpan[],
  ignoredRange: CalendarBlockRange | null = null
): CalendarBlockRange {
  const next = headings.find((candidate) => candidate.start > heading.start
    && candidate.level <= 2
    && (!ignoredRange || !isWithinRange(candidate.start, ignoredRange)));
  return { start: heading.start, end: next?.start ?? noteContent.length };
}

function isMarkerOnlyWrapper(
  noteContent: string,
  markerRange: CalendarBlockRange,
  heading: CalendarHeadingSpan,
  wrapperRange: CalendarBlockRange
): boolean {
  if (markerRange.start < heading.contentEnd || markerRange.end > wrapperRange.end) return false;
  return /^\s*$/u.test(noteContent.slice(heading.contentEnd, markerRange.start))
    && /^\s*$/u.test(noteContent.slice(markerRange.end, wrapperRange.end));
}

function rangesOverlap(left: CalendarBlockRange, right: CalendarBlockRange): boolean {
  return left.start < right.end && right.start < left.end;
}

function isWithinRange(offset: number, range: CalendarBlockRange): boolean {
  return offset >= range.start && offset < range.end;
}

function translateRangeAfterRemoval(range: CalendarBlockRange, removed: CalendarBlockRange): CalendarBlockRange {
  const removedLength = removed.end - removed.start;
  return {
    start: range.start <= removed.start ? range.start : range.start - removedLength,
    end: range.end <= removed.start ? range.end : range.end - removedLength
  };
}

function applyInspectedCalendarUpdate(
  noteContent: string,
  inspection: CalendarDocumentInspection,
  block: string,
  preserveTrailingNewline: boolean
): string {
  if (inspection.kind === "visible-section") {
    if (!inspection.calendarSectionRange) throw new CalendarBlockError("The Calendar section boundary could not be determined.");
    return replaceRange(noteContent, inspection.calendarSectionRange, block, inspection.newline);
  }
  if (inspection.kind === "new-section") {
    return insertAtNotesEnd(noteContent, inspection, block, inspection.newline, preserveTrailingNewline);
  }
  throw new CalendarBlockError("The legacy Calendar block could not be migrated safely.");
}

function replaceRange(noteContent: string, range: CalendarBlockRange, block: string, newline: "\n" | "\r\n"): string {
  const oldContent = noteContent.slice(range.start, range.end);
  const replacement = normalizeNewlines(block, newline) + (oldContent.endsWith("\n") ? newline : "");
  return `${noteContent.slice(0, range.start)}${replacement}${noteContent.slice(range.end)}`;
}

function insertAtNotesEnd(
  noteContent: string,
  inspection: CalendarDocumentInspection,
  block: string,
  newline: "\n" | "\r\n",
  preserveTrailingNewline: boolean
): string {
  const prefix = noteContent.slice(0, inspection.notesEnd);
  const suffix = noteContent.slice(inspection.notesEnd);
  const leadingNewline = prefix.endsWith("\n") ? "" : newline;
  const trailingNewline = suffix.length > 0 || preserveTrailingNewline ? newline : "";
  return `${prefix}${leadingNewline}${normalizeNewlines(block, newline)}${trailingNewline}${suffix}`;
}

function normalizeNewlines(value: string, newline: "\n" | "\r\n"): string {
  return value.replace(/\r\n?|\n/gu, newline);
}

function removeRange(noteContent: string, range: CalendarBlockRange): string {
  return `${noteContent.slice(0, range.start)}${noteContent.slice(range.end)}`;
}

function fenceOpening(line: string): { character: "`" | "~"; length: number } | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(line);
  if (!match) return null;
  const run = match[2];
  return { character: run[0] as "`" | "~", length: run.length };
}

function closesFence(line: string, fence: { character: "`" | "~"; length: number }): boolean {
  return new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`, "u").test(line);
}

function noteLines(noteContent: string): NoteLine[] {
  const rawLines = noteContent.split("\n");
  const lines: NoteLine[] = [];
  let offset = 0;
  for (const raw of rawLines) {
    const content = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const end = offset + raw.length;
    lines.push({ content, start: offset, end, next: Math.min(noteContent.length, end + 1) });
    offset = end + 1;
  }
  return lines;
}
