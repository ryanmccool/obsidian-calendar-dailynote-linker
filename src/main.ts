import { moment, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { fetchCalendarPayload, CalendarBridgeError } from "./calendarBridge";
import { buildPeopleIndex, preparePeopleLinks, type PeopleMarkdownFile } from "./invitees";
import { replaceCalendarBlock } from "./block";
import { renderCalendarBlockWithSummary } from "./render";
import {
  DEFAULT_SETTINGS,
  normalizeExcludedVaultFolders,
  normalizeSectionHeading,
  parsePersistedExcludedVaultFolders,
  tryNormalizeExcludedVaultFolders,
  tryNormalizeSectionHeading,
  type PluginSettings
} from "./settings";
import type { CalendarPayload } from "./types";
import { ActiveDailyNoteError, assertActiveDailyNoteUnchanged } from "./activeDailyNote";
import { summarizeImportOutcome } from "./summary";
import {
  assertSameDailyNoteProvider,
  DailyNoteProviderError,
  inspectDailyNoteProviders,
  resolveActiveDailyNoteProvider,
  type ResolvedDailyNoteProvider
} from "./dailyNoteProviders";

export default class CalendarDailyNoteLinkerPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  excludedVaultFoldersPersistedInvalid = false;
  excludedVaultFoldersInput: string | undefined;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addCommand({
      id: "import-calendar-events-into-active-daily-note",
      name: "Import Calendar events into active Daily Note",
      callback: () => {
        void this.importIntoActiveDailyNote();
      }
    });
    this.addSettingTab(new CalendarDailyNoteLinkerSettingTab(this.app, this));
  }

  private async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as { excludedVaultFolders?: unknown; sectionHeading?: unknown } | null;
    const persistedExcludedFolders = parsePersistedExcludedVaultFolders(saved?.excludedVaultFolders);
    this.excludedVaultFoldersPersistedInvalid = persistedExcludedFolders.malformed;
    this.excludedVaultFoldersInput = persistedExcludedFolders.rawInput;
    this.settings = {
      // Older peopleFolder data is intentionally ignored: matching is vault-wide now.
      excludedVaultFolders: persistedExcludedFolders.folders,
      sectionHeading: normalizeSectionHeading(saved?.sectionHeading)
    };
  }

  async saveSettings(): Promise<void> {
    this.settings.excludedVaultFolders = normalizeExcludedVaultFolders(this.settings.excludedVaultFolders);
    this.settings.sectionHeading = normalizeSectionHeading(this.settings.sectionHeading);
    const data = this.excludedVaultFoldersPersistedInvalid
      ? { ...this.settings, excludedVaultFolders: this.excludedVaultFoldersInput ?? "" }
      : this.settings;
    await this.saveData(data);
  }

  private async importIntoActiveDailyNote(): Promise<void> {
    const progress = new Notice("Checking the active Daily Note…", 0);
    const finish = (message: string): void => {
      progress.setMessage(message);
      window.setTimeout(() => progress.hide(), 10_000);
    };

    try {
      if (process.platform !== "darwin") {
        throw new Error("Calendar Daily Note Linker requires macOS desktop and Calendar.app.");
      }
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile || activeFile.extension.toLowerCase() !== "md") {
        throw new ActiveDailyNoteError("Open an existing configured Daily Note before running this command.");
      }
      if (this.excludedVaultFoldersPersistedInvalid) {
        throw new Error("Saved vault folder exclusions are invalid. Correct them in settings before importing Calendar events.");
      }

      const parseDateFromPath = (relativeStem: string, format: string) =>
        (moment as unknown as (input: string, format: string, strict: boolean) => import("moment").Moment)(relativeStem, format, true);
      const createDateFromIso = (isoDate: string) =>
        (moment as unknown as (input: string, format: string, strict: boolean) => import("moment").Moment)(isoDate, "YYYY-MM-DD", true);
      const initialInspection = inspectDailyNoteProviders(this.app);
      const initialProvider: ResolvedDailyNoteProvider = resolveActiveDailyNoteProvider(
        activeFile,
        initialInspection.candidates,
        parseDateFromPath,
        createDateFromIso,
        initialInspection.errors
      );
      const targetDate = initialProvider.targetDate;

      progress.setMessage(`Reading Calendar for ${targetDate}…`);
      const payload: CalendarPayload = await fetchCalendarPayload(targetDate);
      if (payload.warnings.length) {
        new Notice(`Calendar warning: ${payload.warnings.join(" ")}`, 8_000);
      }

      progress.setMessage("Matching vault notes…");
      const peopleFiles: PeopleMarkdownFile[] = this.app.vault.getMarkdownFiles().map((file) => ({
        path: file.path,
        basename: file.basename,
        file,
        frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined
      }));
      const people = preparePeopleLinks(
        buildPeopleIndex(peopleFiles, this.settings.excludedVaultFolders),
        (target) => {
          if (!target.file) throw new Error(`Vault note is unavailable: ${target.path}`);
          return this.app.fileManager.generateMarkdownLink(target.file, activeFile.path, undefined, target.basename || undefined);
        }
      );
      const rendered = renderCalendarBlockWithSummary(payload, this.settings.sectionHeading, people);

      progress.setMessage("Writing the active Daily Note…");
      const currentFile = this.app.workspace.getActiveFile();
      if (!currentFile || this.app.vault.getAbstractFileByPath(activeFile.path) !== activeFile) {
        throw new ActiveDailyNoteError("The active Daily Note changed, moved, or was deleted; import aborted before writing.");
      }
      const currentInspection = inspectDailyNoteProviders(this.app);
      const currentProvider = resolveActiveDailyNoteProvider(
        currentFile,
        currentInspection.candidates,
        parseDateFromPath,
        createDateFromIso,
        currentInspection.errors
      );
      assertActiveDailyNoteUnchanged(activeFile, currentFile, initialProvider.settings, currentProvider.settings, targetDate, currentProvider.targetDate);
      assertSameDailyNoteProvider(initialProvider, currentProvider);
      await this.app.vault.process(activeFile, (content) => replaceCalendarBlock(content, rendered.block));
      finish(summarizeImportOutcome(targetDate, activeFile.basename, rendered.eventCount, rendered.linkCount));
    } catch (error) {
      const message = error instanceof CalendarBridgeError
        ? error.message
        : error instanceof DailyNoteProviderError || error instanceof ActiveDailyNoteError
          ? error.message
          : `Could not import Calendar events: ${error instanceof Error ? error.message : String(error)}`;
      finish(message);
    }
  }
}

class CalendarDailyNoteLinkerSettingTab extends PluginSettingTab {
  plugin: CalendarDailyNoteLinkerPlugin;

  constructor(app: import("obsidian").App, plugin: CalendarDailyNoteLinkerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Calendar Daily Note Linker" });
    if (this.plugin.excludedVaultFoldersPersistedInvalid) {
      containerEl.createEl("p", { text: "Saved vault folder exclusions are invalid; correct them before importing Calendar events." });
    }

    new Setting(containerEl)
      .setName("Vault folders to exclude")
      .setDesc("Optional vault-relative folders to skip when matching Calendar attendees; one path per line; exclusions include subfolders; blank searches all Markdown notes.")
      .addTextArea((text) => {
        text
          .setPlaceholder("Archive\nTemplates\nPrivate/People")
          .setValue(this.plugin.excludedVaultFoldersInput ?? this.plugin.settings.excludedVaultFolders.join("\n"));
        text.inputEl.addEventListener("blur", () => {
          void this.commitExcludedVaultFolders(text);
        });
      });

    new Setting(containerEl)
      .setName("Section heading")
      .setDesc("Markdown heading used inside the managed Calendar section; saves when focus leaves the field (for example ## Calendar).")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.sectionHeading)
          .setValue(this.plugin.settings.sectionHeading);
        text.inputEl.addEventListener("blur", () => {
          void this.commitSectionHeading(text);
        });
      });

    containerEl.createEl("p", {
      text: "Open an existing configured Daily Note, then run the command; it updates that open note for its date."
    });
  }

  private async commitSectionHeading(text: import("obsidian").TextComponent): Promise<void> {
    const previous = this.plugin.settings.sectionHeading;
    const normalized = tryNormalizeSectionHeading(text.getValue());
    if (!normalized) {
      text.setValue(previous);
      new Notice("Use a Markdown heading from # to ######, such as ## Calendar.");
      return;
    }

    this.plugin.settings.sectionHeading = normalized;
    text.setValue(normalized);
    try {
      await this.plugin.saveSettings();
    } catch (error) {
      this.plugin.settings.sectionHeading = previous;
      text.setValue(previous);
      new Notice(`Could not save the Section heading: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async commitExcludedVaultFolders(text: import("obsidian").TextAreaComponent): Promise<void> {
    const previous = [...this.plugin.settings.excludedVaultFolders];
    const previousInvalid = this.plugin.excludedVaultFoldersPersistedInvalid;
    const previousInput = this.plugin.excludedVaultFoldersInput;
    const normalized = tryNormalizeExcludedVaultFolders(text.getValue());
    if (!normalized) {
      if (!this.plugin.excludedVaultFoldersPersistedInvalid) text.setValue(previous.join("\n"));
      new Notice("Use one safe vault-relative folder per line, or leave the field blank.");
      return;
    }

    this.plugin.settings.excludedVaultFolders = normalized;
    this.plugin.excludedVaultFoldersPersistedInvalid = false;
    this.plugin.excludedVaultFoldersInput = undefined;
    text.setValue(normalized.join("\n"));
    try {
      await this.plugin.saveSettings();
    } catch (error) {
      this.plugin.settings.excludedVaultFolders = previous;
      this.plugin.excludedVaultFoldersPersistedInvalid = previousInvalid;
      this.plugin.excludedVaultFoldersInput = previousInput;
      text.setValue(previousInvalid ? previousInput ?? "" : previous.join("\n"));
      new Notice(`Could not save excluded folders: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
