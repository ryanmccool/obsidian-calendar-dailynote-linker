export const CALENDAR_START_MARKER = "<!-- calendar-daily-note-linker:start -->";
export const CALENDAR_END_MARKER = "<!-- calendar-daily-note-linker:end -->";

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

interface NoteLine {
  raw: string;
  content: string;
  start: number;
  end: number;
  next: number;
}

export function makeCalendarBlock(lines: readonly string[]): string {
  return [CALENDAR_START_MARKER, ...lines.map(sanitizeMarkdownLine), CALENDAR_END_MARKER].join("\n");
}

export function replaceCalendarBlock(noteContent: string, block: string): string {
  validateGeneratedBlock(block);
  const range = findCalendarBlockRange(noteContent);
  if (!range) {
    return appendCalendarBlock(noteContent, block);
  }
  const replacement = noteContent.slice(range.start, range.end).endsWith("\n") ? `${block}\n` : block;
  return `${noteContent.slice(0, range.start)}${replacement}${noteContent.slice(range.end)}`;
}

/** Find and validate the one managed block, returning line-inclusive offsets. */
export function findCalendarBlockRange(noteContent: string): CalendarBlockRange | null {
  const lines = noteLines(noteContent);
  const starts: NoteLine[] = [];
  const ends: NoteLine[] = [];

  for (const line of lines) {
    const isStart = line.content === CALENDAR_START_MARKER;
    const isEnd = line.content === CALENDAR_END_MARKER;
    if (isStart) starts.push(line);
    if (isEnd) ends.push(line);

    const containsMarker = line.content.includes(CALENDAR_START_MARKER) || line.content.includes(CALENDAR_END_MARKER);
    if (containsMarker && !isStart && !isEnd) {
      throw new CalendarBlockError("The Calendar section marker must be on an exact standalone line.");
    }
  }

  if (starts.length === 0 && ends.length === 0) return null;
  if (starts.length !== 1 || ends.length !== 1 || starts[0].start >= ends[0].start) {
    throw new CalendarBlockError("The Calendar section markers are duplicated, incomplete, or out of order.");
  }
  return { start: starts[0].start, end: ends[0].next };
}

export function removeCalendarBlock(noteContent: string): string {
  const range = findCalendarBlockRange(noteContent);
  if (!range) return noteContent;
  return `${noteContent.slice(0, range.start)}${noteContent.slice(range.end)}`;
}

export function validateGeneratedBlock(block: string): void {
  const lines = block.split("\n").map((rawLine) => rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine);
  if (lines[0] !== CALENDAR_START_MARKER || lines[lines.length - 1] !== CALENDAR_END_MARKER) {
    throw new CalendarBlockError("Generated Calendar content has invalid section markers.");
  }
  if (lines.slice(1, -1).some((line) => line.includes(CALENDAR_START_MARKER) || line.includes(CALENDAR_END_MARKER))) {
    throw new CalendarBlockError("Generated Calendar content contains a section marker literal.");
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

function appendCalendarBlock(noteContent: string, block: string): string {
  const separator = noteContent.length > 0 && !noteContent.endsWith("\n") ? "\n" : "";
  return `${noteContent}${separator}${block}\n`;
}

function noteLines(noteContent: string): NoteLine[] {
  const rawLines = noteContent.split("\n");
  const lines: NoteLine[] = [];
  let offset = 0;
  for (const raw of rawLines) {
    const content = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const end = offset + raw.length;
    lines.push({ raw, content, start: offset, end, next: Math.min(noteContent.length, end + 1) });
    offset = end + 1;
  }
  return lines;
}
