import type { ActiveDailyNoteFile, CoreDailyNoteSettings, ParsedDailyDate } from "./activeDailyNote";
import { ActiveDailyNoteError, resolveActiveDailyDate } from "./activeDailyNote";

export type DailyNoteProviderKind = "core" | "periodic";

export interface DailyNoteProviderCandidate {
  kind: DailyNoteProviderKind;
  settings: CoreDailyNoteSettings;
}

export interface ResolvedDailyNoteProvider extends DailyNoteProviderCandidate {
  targetDate: string;
}

export class DailyNoteProviderCompatibilityError extends Error {
  kind: DailyNoteProviderKind;

  constructor(kind: DailyNoteProviderKind, message: string) {
    super(message);
    this.name = "DailyNoteProviderCompatibilityError";
    this.kind = kind;
  }
}

export class DailyNoteProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyNoteProviderError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOption(record: Record<string, unknown>, key: string, fallback: string, kind: DailyNoteProviderKind): string {
  const value = record[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") {
    throw new DailyNoteProviderCompatibilityError(kind, `${kind === "core" ? "Core Daily Notes" : "Periodic Notes"} ${key} setting has an unsupported shape.`);
  }
  if (key === "format" && value.trim() === "") return fallback;
  return key === "folder" || key === "template" ? value.trim() : value;
}

function settingsFrom(record: Record<string, unknown>, kind: DailyNoteProviderKind): CoreDailyNoteSettings {
  return {
    folder: stringOption(record, "folder", "", kind),
    format: stringOption(record, "format", "YYYY-MM-DD", kind),
    template: stringOption(record, "template", "", kind)
  };
}

export interface DailyNoteProviderInspection {
  candidates: DailyNoteProviderCandidate[];
  errors: DailyNoteProviderCompatibilityError[];
}

export function inspectDailyNoteProviders(app: unknown): DailyNoteProviderInspection {
  if (!isRecord(app)) {
    return {
      candidates: [],
      errors: [new DailyNoteProviderCompatibilityError("core", "Core Daily Notes provider shape is unavailable.")]
    };
  }
  const candidates: DailyNoteProviderCandidate[] = [];
  const errors: DailyNoteProviderCompatibilityError[] = [];
  try {
    const internalPlugins = isRecord(app.internalPlugins) && isRecord(app.internalPlugins.plugins)
      ? app.internalPlugins.plugins
      : undefined;
    const corePlugin = internalPlugins?.["daily-notes"];
    if (isRecord(corePlugin) && corePlugin.enabled === true) {
      if (!isRecord(corePlugin.instance) || !isRecord(corePlugin.instance.options)) {
        errors.push(new DailyNoteProviderCompatibilityError("core", "Core Daily Notes settings/options are unavailable or unsupported."));
      } else {
        try {
          candidates.push({ kind: "core", settings: settingsFrom(corePlugin.instance.options, "core") });
        } catch (error) {
          if (error instanceof DailyNoteProviderCompatibilityError) errors.push(error);
          else errors.push(new DailyNoteProviderCompatibilityError("core", "Core Daily Notes settings could not be read safely."));
        }
      }
    }
  } catch {
    errors.push(new DailyNoteProviderCompatibilityError("core", "Core Daily Notes provider shape is unavailable or unsupported."));
  }

  try {
    const plugins = isRecord(app.plugins) ? app.plugins : undefined;
    const getPlugin = plugins && typeof plugins.getPlugin === "function"
      ? plugins.getPlugin.bind(plugins) as (id: string) => unknown
      : undefined;
    if (!getPlugin) {
      return { candidates, errors: [...errors, new DailyNoteProviderCompatibilityError("periodic", "Periodic Notes provider shape is unavailable or unsupported.")] };
    }
    const periodic = getPlugin?.("periodic-notes");
    if (periodic !== undefined) {
      if (!isRecord(periodic) || !isRecord(periodic.settings) || !isRecord(periodic.settings.daily)) {
        errors.push(new DailyNoteProviderCompatibilityError("periodic", "Periodic Notes daily settings are unavailable or unsupported."));
      } else if (periodic.settings.daily.enabled === true) {
        try {
          candidates.push({ kind: "periodic", settings: settingsFrom(periodic.settings.daily, "periodic") });
        } catch (error) {
          if (error instanceof DailyNoteProviderCompatibilityError) errors.push(error);
          else errors.push(new DailyNoteProviderCompatibilityError("periodic", "Periodic Notes daily settings could not be read safely."));
        }
      }
    }
  } catch {
    errors.push(new DailyNoteProviderCompatibilityError("periodic", "Periodic Notes provider shape is unavailable or unsupported."));
  }
  return { candidates, errors };
}

export function getDailyNoteProviderCandidates(app: unknown): DailyNoteProviderCandidate[] {
  return inspectDailyNoteProviders(app).candidates;
}

export function resolveActiveDailyNoteProvider(
  file: ActiveDailyNoteFile,
  candidates: readonly DailyNoteProviderCandidate[],
  parseDateFromPath: (relativeStem: string, format: string, strict?: boolean) => ParsedDailyDate | null,
  createDateFromIso: (isoDate: string) => ParsedDailyDate | null,
  compatibilityErrors: readonly DailyNoteProviderCompatibilityError[] = []
): ResolvedDailyNoteProvider {
  const matches: ResolvedDailyNoteProvider[] = [];
  for (const candidate of candidates) {
    try {
      const targetDate = resolveActiveDailyDate(file, candidate.settings, parseDateFromPath, undefined, createDateFromIso);
      matches.push({ ...candidate, targetDate });
    } catch {
      // This provider simply does not describe the active file.
    }
  }
  if (!matches.length) {
    const details = compatibilityErrors.length ? ` ${compatibilityErrors.map((error) => error.message).join(" ")}` : "";
    throw new DailyNoteProviderError(`The active note does not match configured Daily Notes or Periodic Notes settings.${details} Open a configured Daily Note or check those settings.`);
  }
  const dates = new Set(matches.map((match) => match.targetDate));
  if (dates.size > 1) {
    throw new DailyNoteProviderError("The active note matches multiple Daily Notes configurations with different dates; import is ambiguous.");
  }
  return matches.find((match) => match.kind === "core") ?? matches[0];
}

export function assertSameDailyNoteProvider(
  initial: ResolvedDailyNoteProvider,
  current: ResolvedDailyNoteProvider
): void {
  if (initial.kind !== current.kind || initial.targetDate !== current.targetDate ||
    (initial.settings.folder ?? "") !== (current.settings.folder ?? "") ||
    (initial.settings.format ?? "") !== (current.settings.format ?? "") ||
    (initial.settings.template ?? "") !== (current.settings.template ?? "")) {
    throw new ActiveDailyNoteError("The Daily Note provider or configuration changed; import aborted before writing.");
  }
}
