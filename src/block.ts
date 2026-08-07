export const CALENDAR_START_MARKER = "<!-- calendar-daily-note-linker:start -->";
export const CALENDAR_END_MARKER = "<!-- calendar-daily-note-linker:end -->";

export class CalendarBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarBlockError";
  }
}

export function makeCalendarBlock(lines: readonly string[]): string {
  return [CALENDAR_START_MARKER, ...lines.map(sanitizeMarkdownLine), CALENDAR_END_MARKER].join("\n");
}

export function replaceCalendarBlock(noteContent: string, block: string): string {
  validateGeneratedBlock(block);
  const starts: number[] = [];
  const ends: number[] = [];
  const lines = noteContent.split("\n");

  lines.forEach((rawLine, index) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const isStart = line === CALENDAR_START_MARKER;
    const isEnd = line === CALENDAR_END_MARKER;
    if (isStart) starts.push(index);
    if (isEnd) ends.push(index);

    const containsMarker = line.includes(CALENDAR_START_MARKER) || line.includes(CALENDAR_END_MARKER);
    if (containsMarker && !isStart && !isEnd) {
      throw new CalendarBlockError("The Calendar section marker must be on an exact standalone line.");
    }
  });

  if (starts.length === 0 && ends.length === 0) {
    return appendCalendarBlock(noteContent, block);
  }
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) {
    throw new CalendarBlockError("The Calendar section markers are duplicated, incomplete, or out of order.");
  }

  const startOffset = lineStartOffset(lines, starts[0]);
  const endOffset = lineStartOffset(lines, ends[0] + 1);
  return `${noteContent.slice(0, startOffset)}${block}${noteContent.slice(endOffset)}`;
}

function validateGeneratedBlock(block: string): void {
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

function lineStartOffset(lines: readonly string[], lineIndex: number): number {
  let offset = 0;
  for (let index = 0; index < lineIndex && index < lines.length; index += 1) {
    offset += lines[index].length + 1;
  }
  return offset;
}
