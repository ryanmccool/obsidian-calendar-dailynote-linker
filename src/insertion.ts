import {
  replaceOrCreateCalendarSection,
  CalendarBlockError,
  type CalendarBlockRange
} from "./block";
import { parseStandaloneAtxHeadings } from "./markdown";

export class CalendarInsertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarInsertionError";
  }
}

export function findExactHeadingOffsets(noteContent: string, heading: string): number[] {
  return parseStandaloneAtxHeadings(noteContent)
    .filter((candidate) => candidate.text === heading)
    .map((candidate) => candidate.start);
}

/** Replace or create the fixed visible Calendar section under the unique # Notes heading. */
export function insertCalendarSection(noteContent: string, block: string): string {
  try {
    return replaceOrCreateCalendarSection(noteContent, block);
  } catch (error) {
    if (error instanceof CalendarBlockError) {
      throw new CalendarInsertionError(`${error.message}; import aborted without changing the note.`);
    }
    throw error;
  }
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
  if (heading !== "# Notes") {
    throw new CalendarInsertionError("Calendar sections are fixed under the unique # Notes heading.");
  }
  return insertCalendarSection(noteContent, block);
}

export function relocateCalendarBlock(
  noteContent: string,
  block: string,
  insertionMode: "heading" | "cursor",
  insertionHeading: string
): string {
  if (insertionMode === "cursor") throw new CalendarInsertionError("Cursor insertion is no longer supported; Calendar is fixed under # Notes.");
  return insertCalendarSection(noteContent, block);
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
  void noteContent;
  void block;
  void cursorOffset;
  throw new CalendarInsertionError("Cursor insertion is no longer supported; Calendar is fixed under # Notes.");
}
