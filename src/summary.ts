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
  return options.insertionMode === "heading"
    ? `below ${options.insertionHeading}`
    : "at the active editor cursor";
}

function formattingDescription(options: ImportSummaryOptions): string {
  const links = [
    options.linkMatchingVaultNotes ? "matching vault notes on" : "matching vault notes off",
    options.linkEventTitles ? "event title links on" : "event title links off"
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
      return `Imported ${eventCount} Calendar ${eventLabel} into ${noteName}. No attendees or event titles uniquely matched vault notes.`;
    }
    const linkLabel = linkCount === 1 ? "link" : "links";
    return `Imported ${eventCount} Calendar ${eventLabel} into ${noteName} and added ${linkCount} vault ${linkLabel}.`;
  }

  const mode = `${destinationDescription(options)}; ${formattingDescription(options)}; managed block relocated`;
  if (eventCount === 0) {
    return `No Calendar events found for ${targetDate}; updated ${noteName} (${mode}).`;
  }
  const eventLabel = eventCount === 1 ? "event" : "events";
  const linkLabel = linkCount === 1 ? "link" : "links";
  const linkSummary = linkCount === 0
    ? options.linkMatchingVaultNotes
      ? "No attendees or event titles uniquely matched vault notes."
      : "Vault-note matching links are disabled."
    : `Added ${linkCount} vault ${linkLabel}.`;
  return `Imported ${eventCount} Calendar ${eventLabel} into ${noteName} (${mode}). ${linkSummary}`;
}
