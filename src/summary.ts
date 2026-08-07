export function summarizeImportOutcome(
  targetDate: string,
  noteName: string,
  eventCount: number,
  linkCount: number
): string {
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
