import {
  findCalendarBlockRange,
  removeCalendarBlock,
  validateGeneratedBlock,
  type CalendarBlockRange
} from "./block";
import { parseStandaloneAtxHeadings } from "./markdown";

export class CalendarInsertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarInsertionError";
  }
}

function newlineFor(noteContent: string): string {
  return noteContent.includes("\r\n") ? "\r\n" : "\n";
}

export function findExactHeadingOffsets(noteContent: string, heading: string): number[] {
  return parseStandaloneAtxHeadings(noteContent)
    .filter((candidate) => candidate.text === heading)
    .map((candidate) => candidate.start);
}

function insertBelowOffset(noteContent: string, headingOffset: number, heading: string, block: string): string {
  const headingLine = parseStandaloneAtxHeadings(noteContent)
    .find((line) => line.start === headingOffset && line.text === heading);
  if (!headingLine) throw new CalendarInsertionError("The configured insertion heading could not be located.");
  const newline = newlineFor(noteContent);
  const lineBreakLength = noteContent.startsWith("\r\n", headingLine.contentEnd)
    ? 2
    : noteContent[headingLine.contentEnd] === "\n"
      ? 1
      : 0;
  const hasLineBreak = lineBreakLength > 0;
  const separator = newline;
  const blockSuffix = hasLineBreak ? newline : "";
  return `${noteContent.slice(0, headingLine.contentEnd)}${separator}${block}${blockSuffix}${noteContent.slice(headingLine.contentEnd + lineBreakLength)}`;
}

/**
 * Remove the old block first, then place the new one under exactly one heading.
 * All validation happens before returning, so callers can safely abort without
 * changing the note when the destination is missing or ambiguous.
 */
export function insertCalendarBlockBelowHeading(
  noteContent: string,
  block: string,
  heading: string
): string {
  validateGeneratedBlock(block);
  const oldRange = findCalendarBlockRange(noteContent);
  const withoutOldBlock = oldRange ? removeCalendarBlock(noteContent) : noteContent;
  const headingOffsets = findExactHeadingOffsets(withoutOldBlock, heading);
  if (headingOffsets.length === 0) {
    throw new CalendarInsertionError(`The insertion heading ${heading} was not found exactly once; import aborted without changing the note.`);
  }
  if (headingOffsets.length > 1) {
    throw new CalendarInsertionError(`The insertion heading ${heading} must appear exactly once; it appears ${headingOffsets.length} times, so import aborted without changing the note.`);
  }
  return insertBelowOffset(withoutOldBlock, headingOffsets[0], heading, block);
}

export function relocateCalendarBlock(
  noteContent: string,
  block: string,
  insertionMode: "heading" | "cursor",
  insertionHeading: string
): string {
  if (insertionMode === "heading") return insertCalendarBlockBelowHeading(noteContent, block, insertionHeading);
  throw new CalendarInsertionError("Cursor insertion requires an active Markdown editor.");
}

/** Map a cursor offset from the original buffer to the buffer after removal. */
export function calculateCursorInsertionOffset(
  cursorOffset: number,
  oldRange: CalendarBlockRange | null
): number {
  if (!oldRange) return Math.max(0, cursorOffset);
  if (cursorOffset <= oldRange.start) return cursorOffset;
  if (cursorOffset >= oldRange.end) return cursorOffset - (oldRange.end - oldRange.start);
  return oldRange.start;
}

export interface CursorRelocationResult {
  content: string;
  insertionOffset: number;
  oldRange: CalendarBlockRange | null;
}

export function relocateCalendarBlockAtCursor(
  noteContent: string,
  block: string,
  cursorOffset: number
): CursorRelocationResult {
  validateGeneratedBlock(block);
  if (!Number.isSafeInteger(cursorOffset) || cursorOffset < 0 || cursorOffset > noteContent.length) {
    throw new CalendarInsertionError("The active editor cursor is unavailable; import aborted without changing the note.");
  }
  const oldRange = findCalendarBlockRange(noteContent);
  const insertionOffset = calculateCursorInsertionOffset(cursorOffset, oldRange);
  const withoutOldBlock = oldRange ? removeCalendarBlock(noteContent) : noteContent;
  const needsLeadingLineBreak = insertionOffset > 0 && withoutOldBlock[insertionOffset - 1] !== "\n";
  const needsTrailingLineBreak = insertionOffset < withoutOldBlock.length && withoutOldBlock[insertionOffset] !== "\n";
  const leadingLineBreak = needsLeadingLineBreak ? newlineFor(withoutOldBlock) : "";
  const trailingLineBreak = needsTrailingLineBreak ? newlineFor(withoutOldBlock) : "";
  return {
    content: `${withoutOldBlock.slice(0, insertionOffset)}${leadingLineBreak}${block}${trailingLineBreak}${withoutOldBlock.slice(insertionOffset)}`,
    insertionOffset,
    oldRange
  };
}
