export interface PluginSettings {
  excludedVaultFolders: string[];
  /** null keeps the legacy behavior of importing every available calendar. */
  selectedCalendarIds: string[] | null;
  insertionMode: InsertionMode;
  insertionHeading: string;
  eventHeadingLevel: EventHeadingLevel;
  timeFormat: TimeFormat;
  linkMatchingVaultNotes: boolean;
  linkEventTitles: boolean;
}

export type InsertionMode = "heading" | "cursor";
export type EventHeadingLevel = 3 | 4 | 5 | 6;
export type TimeFormat = "24-hour" | "12-hour";

export const DEFAULT_SETTINGS: PluginSettings = {
  excludedVaultFolders: [],
  selectedCalendarIds: null,
  insertionMode: "heading",
  insertionHeading: "# Notes",
  eventHeadingLevel: 3,
  timeFormat: "24-hour",
  linkMatchingVaultNotes: true,
  linkEventTitles: true
};

export class ExcludedVaultFolderError extends Error {
  constructor() {
    super("Vault folder exclusions are malformed. Correct them in settings before importing Calendar events.");
    this.name = "ExcludedVaultFolderError";
  }
}

function normalizeFolderPath(value: string): string | undefined {
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    parts.some((part) => part.length === 0 || part === "." || part === ".." || part.includes("\0"))
  ) {
    return undefined;
  }
  return normalized;
}

export function tryNormalizeExcludedVaultFolders(value: unknown): string[] | undefined {
  const isArrayInput = Array.isArray(value);
  const lines = typeof value === "string"
    ? value.split(/\r\n?|\n|\u2028|\u2029/gu)
    : isArrayInput && value.every((item) => typeof item === "string")
      ? value as string[]
      : undefined;
  if (!lines) return undefined;

  const normalized: string[] = [];
  for (const line of lines) {
    if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(line)) return undefined;
    if (!line.trim()) continue;
    const path = normalizeFolderPath(line);
    if (!path) return undefined;
    if (!normalized.includes(path)) normalized.push(path);
  }
  return normalized;
}

export function normalizeExcludedVaultFolders(value: unknown): string[] {
  if (value === undefined) return DEFAULT_SETTINGS.excludedVaultFolders;
  const normalized = tryNormalizeExcludedVaultFolders(value);
  if (!normalized) throw new ExcludedVaultFolderError();
  return normalized;
}

export function tryNormalizeSelectedCalendarIds(value: unknown): string[] | null | undefined {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return undefined;
  const calendarIds: string[] = [];
  for (const id of value) {
    if (!id || /[\u0000-\u001f\u007f-\u009f]/u.test(id)) return undefined;
    if (!calendarIds.includes(id)) calendarIds.push(id);
  }
  return calendarIds;
}

export function normalizeSelectedCalendarIds(value: unknown): string[] | null {
  const normalized = tryNormalizeSelectedCalendarIds(value);
  if (normalized === undefined) throw new Error("Calendar selection is malformed. Correct it in settings before importing Calendar events.");
  return normalized;
}

export interface PersistedSelectedCalendarIds {
  ids: string[] | null;
  malformed: boolean;
  rawInput?: unknown;
}

export function parsePersistedSelectedCalendarIds(value: unknown): PersistedSelectedCalendarIds {
  if (value === undefined || value === null) return { ids: null, malformed: false };
  const normalized = tryNormalizeSelectedCalendarIds(value);
  if (normalized !== undefined) return { ids: normalized, malformed: false };
  return { ids: [], malformed: true, rawInput: value };
}

export interface PersistedExcludedVaultFolders {
  folders: string[];
  malformed: boolean;
  rawInput?: string;
}

export function parsePersistedExcludedVaultFolders(value: unknown): PersistedExcludedVaultFolders {
  if (value === undefined) return { folders: [], malformed: false };
  const normalized = tryNormalizeExcludedVaultFolders(value);
  if (normalized) return { folders: normalized, malformed: false };
  return {
    folders: [],
    malformed: true,
    rawInput: typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.map(String).join("\n")
        : String(value)
  };
}

export function tryNormalizeInsertionHeading(value: unknown): string | undefined {
  return value === "# Notes" ? "# Notes" : undefined;
}

export function normalizeInsertionHeading(value: unknown): string {
  return tryNormalizeInsertionHeading(value) ?? DEFAULT_SETTINGS.insertionHeading;
}

// Kept for source compatibility with callers that still parse the old field.
// The visible section is always ## Calendar.
export function tryNormalizeSectionHeading(value: unknown): string | undefined {
  return value === "## Calendar" ? "## Calendar" : undefined;
}
export function normalizeSectionHeading(_value: unknown): string {
  return "## Calendar";
}

export function tryNormalizeInsertionMode(value: unknown): InsertionMode | undefined {
  return value === "heading" || value === "cursor" ? "heading" : undefined;
}

export function normalizeInsertionMode(value: unknown): InsertionMode {
  return tryNormalizeInsertionMode(value) ?? DEFAULT_SETTINGS.insertionMode;
}

export function tryNormalizeEventHeadingLevel(value: unknown): EventHeadingLevel | undefined {
  const numeric = typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value;
  return numeric === 2
    ? 3
    : numeric === 3 || numeric === 4 || numeric === 5 || numeric === 6
      ? numeric
    : undefined;
}

export function normalizeEventHeadingLevel(value: unknown): EventHeadingLevel {
  return tryNormalizeEventHeadingLevel(value) ?? DEFAULT_SETTINGS.eventHeadingLevel;
}

export function tryNormalizeTimeFormat(value: unknown): TimeFormat | undefined {
  return value === "24-hour" || value === "12-hour" ? value : undefined;
}

export function normalizeTimeFormat(value: unknown): TimeFormat {
  return tryNormalizeTimeFormat(value) ?? DEFAULT_SETTINGS.timeFormat;
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export interface PersistedPluginSettings {
  excludedVaultFolders: PersistedExcludedVaultFolders;
  selectedCalendarIds: PersistedSelectedCalendarIds;
  insertionMode: InsertionMode;
  insertionHeading: string;
  eventHeadingLevel: EventHeadingLevel;
  timeFormat: TimeFormat;
  linkMatchingVaultNotes: boolean;
  linkEventTitles: boolean;
}

/** Parse settings without carrying forward old People configuration. */
export function parsePersistedPluginSettings(value: unknown): PersistedPluginSettings {
  const saved = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    excludedVaultFolders: parsePersistedExcludedVaultFolders(saved.excludedVaultFolders),
    selectedCalendarIds: parsePersistedSelectedCalendarIds(saved.selectedCalendarIds),
    insertionMode: "heading",
    insertionHeading: "# Notes",
    eventHeadingLevel: normalizeEventHeadingLevel(saved.eventHeadingLevel),
    timeFormat: normalizeTimeFormat(saved.timeFormat),
    linkMatchingVaultNotes: normalizeBoolean(saved.linkMatchingVaultNotes, DEFAULT_SETTINGS.linkMatchingVaultNotes),
    linkEventTitles: normalizeBoolean(saved.linkEventTitles, DEFAULT_SETTINGS.linkEventTitles)
  };
}
