export type DailyNotesMode = "core" | "disabled" | "periodic";

export class DailyNotesModeError extends Error {
  constructor(mode: DailyNotesMode) {
    super(mode === "periodic"
      ? "Periodic Notes daily functionality is enabled. Disable it and enable the core Daily Notes plugin."
      : "The core Daily Notes plugin is unavailable. Enable it and try again.");
    this.name = "DailyNotesModeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Safely inspects the public app shape used by Obsidian's plugin managers.
 * The interface package falls back to Periodic Notes, so that mode is rejected.
 */
export function getDailyNotesMode(app: unknown): DailyNotesMode {
  try {
    if (!isRecord(app)) return "disabled";

    const internalPlugins = isRecord(app.internalPlugins) ? app.internalPlugins : undefined;
    const internalPluginMap = internalPlugins && isRecord(internalPlugins.plugins) ? internalPlugins.plugins : undefined;
    const coreDailyNotes = internalPluginMap?.["daily-notes"];
    const coreEnabled = isRecord(coreDailyNotes) && coreDailyNotes.enabled === true;

    const plugins = isRecord(app.plugins) ? app.plugins : undefined;
    const getPlugin = plugins && typeof plugins.getPlugin === "function"
      ? plugins.getPlugin.bind(plugins) as (id: string) => unknown
      : undefined;
    const periodicNotes = getPlugin?.("periodic-notes");
    const periodicSettings = isRecord(periodicNotes) && isRecord(periodicNotes.settings)
      ? periodicNotes.settings
      : undefined;
    const periodicDailySettings = periodicSettings && isRecord(periodicSettings.daily)
      ? periodicSettings.daily
      : undefined;
    if (periodicDailySettings?.enabled === true) return "periodic";
    return coreEnabled ? "core" : "disabled";
  } catch {
    return "disabled";
  }
}

export function assertCoreDailyNotes(app: unknown): void {
  const mode = getDailyNotesMode(app);
  if (mode !== "core") throw new DailyNotesModeError(mode);
}
