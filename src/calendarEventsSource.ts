// The production build replaces this token with the fixed JXA source from
// scripts/calendar-events.js. The fallback keeps source-level tests independent
// from the filesystem and is never used by a production bundle.
declare const __CALENDAR_EVENTS_SCRIPT__: string;

export const CALENDAR_EVENTS_SCRIPT = typeof __CALENDAR_EVENTS_SCRIPT__ === "string"
  ? __CALENDAR_EVENTS_SCRIPT__
  : "// Calendar JXA source is injected during the production build.";
