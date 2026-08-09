import type { InsertionMode, TimeFormat, EventHeadingLevel } from "./settings";

export interface ImportSummaryOptions {
  insertionMode: InsertionMode;
  insertionHeading: string;
  eventHeadingLevel: EventHeadingLevel;
  timeFormat: TimeFormat;
  linkMatchingVaultNotes: boolean;
  linkEventTitles: boolean;
}

function destinationDescription(options: ImportSummaryOptions): string {
  void options;
  return "under # Notes";
}

function formattingDescription(options: ImportSummaryOptions): string {
  const links = [
    options.linkMatchingVaultNotes ? "attendee-name links on (title names only)" : "attendee-name links off",
    options.linkEventTitles ? "Calendar URL links on (separate when needed)" : "Calendar URL links off"
  ];
  return `Heading ${options.eventHeadingLevel}, ${options.timeFormat}, ${links.join(", ")}`;
}

export function summarizeImportOutcome(
  targetDate: string,
  noteName: string,
  eventCount: number,
  linkCount: number,
  options?: ImportSummaryOptions
): string {
  if (!options) {
    if (eventCount === 0) {
      return `No Calendar events found for ${targetDate}. The active Daily Note was updated.`;
    }
    const eventLabel = eventCount === 1 ? "event" : "events";
    if (linkCount === 0) {
      return `Imported ${eventCount} Calendar ${eventLabel} into ${noteName}. No uniquely matched attendee names appeared in event titles.`;
    }
    const linkLabel = linkCount === 1 ? "link" : "links";
    return `Imported ${eventCount} Calendar ${eventLabel} into ${noteName} and added ${linkCount} vault ${linkLabel} for attendee names present in event titles.`;
  }

  const mode = `${destinationDescription(options)}; ${formattingDescription(options)}; visible Calendar section updated`;
  if (eventCount === 0) {
    return `No Calendar events found for ${targetDate}; updated ${noteName} (${mode}).`;
  }
  const eventLabel = eventCount === 1 ? "event" : "events";
  const linkLabel = linkCount === 1 ? "link" : "links";
  const linkSummary = linkCount === 0
    ? options.linkMatchingVaultNotes
      ? "No uniquely matched attendee names appeared in event titles."
      : "Attendee-name matching links are disabled."
    : `Added ${linkCount} vault ${linkLabel} for attendee names present in event titles.`;
  return `Imported ${eventCount} Calendar ${eventLabel} into ${noteName} (${mode}). ${linkSummary}`;
}
