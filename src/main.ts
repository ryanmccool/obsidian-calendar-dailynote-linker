import { MarkdownView, moment, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { fetchCalendarPayload, CalendarBridgeError } from "./calendarBridge";
import { buildPeopleIndex, preparePeopleIndexForImport, preparePeopleLinks, type PeopleMarkdownFile } from "./invitees";
import { renderCalendarBlockWithSummary } from "./render";
import {
  DEFAULT_SETTINGS,
  normalizeBoolean,
  normalizeEventHeadingLevel,
  normalizeExcludedVaultFolders,
  parsePersistedPluginSettings,
  tryNormalizeEventHeadingLevel,
  tryNormalizeExcludedVaultFolders,
  tryNormalizeTimeFormat,
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
import {
  CalendarInsertionError,
  insertCalendarSection
} from "./insertion";

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
    const saved = await this.loadData();
    const parsed = parsePersistedPluginSettings(saved);
    this.excludedVaultFoldersPersistedInvalid = parsed.excludedVaultFolders.malformed;
    this.excludedVaultFoldersInput = parsed.excludedVaultFolders.rawInput;
    this.settings = {
      excludedVaultFolders: parsed.excludedVaultFolders.folders,
      insertionMode: parsed.insertionMode,
      insertionHeading: parsed.insertionHeading,
      eventHeadingLevel: parsed.eventHeadingLevel,
      timeFormat: parsed.timeFormat,
      linkMatchingVaultNotes: parsed.linkMatchingVaultNotes,
      linkEventTitles: parsed.linkEventTitles
    };
  }

  async saveSettings(): Promise<void> {
    const excludedVaultFolders = normalizeExcludedVaultFolders(this.settings.excludedVaultFolders);
    const eventHeadingLevel = tryNormalizeEventHeadingLevel(this.settings.eventHeadingLevel);
    if (!eventHeadingLevel) throw new Error("Event heading level must be Heading 3 through Heading 6.");
    const timeFormat = tryNormalizeTimeFormat(this.settings.timeFormat);
    if (!timeFormat) throw new Error("Time format must be 24-hour or 12-hour.");
    if (typeof this.settings.linkMatchingVaultNotes !== "boolean" || typeof this.settings.linkEventTitles !== "boolean") {
      throw new Error("Linking settings must be enabled or disabled.");
    }

    this.settings = {
      excludedVaultFolders,
      insertionMode: "heading",
      insertionHeading: "# Notes",
      eventHeadingLevel,
      timeFormat,
      linkMatchingVaultNotes: normalizeBoolean(this.settings.linkMatchingVaultNotes, DEFAULT_SETTINGS.linkMatchingVaultNotes),
      linkEventTitles: normalizeBoolean(this.settings.linkEventTitles, DEFAULT_SETTINGS.linkEventTitles)
    };
    const data = this.excludedVaultFoldersPersistedInvalid
      ? { ...this.settings, excludedVaultFolders: this.excludedVaultFoldersInput ?? "" }
      : this.settings;
    await this.saveData(data);
  }

  private activeMarkdownEditor(file: import("obsidian").TFile): import("obsidian").Editor | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.editor || !view.file || view.file.path !== file.path) return null;
    return view.editor;
  }

  private replaceEditorContent(editor: import("obsidian").Editor, before: string, after: string): void {
    if (before === after) return;
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      before[before.length - suffix - 1] === after[after.length - suffix - 1]
    ) suffix += 1;
    const from = editor.offsetToPos(prefix);
    const to = editor.offsetToPos(before.length - suffix);
    editor.replaceRange(after.slice(prefix, after.length - suffix), from, to, "calendar-daily-note-linker");
  }

  private async importIntoActiveDailyNote(): Promise<void> {
    const progress = new Notice("Checking the active Daily Note…", 0);
    const finish = (message: string): void => {
      progress.setMessage(message);
      window.setTimeout(() => progress.hide(), 10_000);
    };

    try {
      if (process.platform !== "darwin") {
        throw new Error("Calendar Daily Note Linker requires macOS desktop and Calendar access.");
      }
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile || activeFile.extension.toLowerCase() !== "md") {
        throw new ActiveDailyNoteError("Open an existing configured Daily Note before running this command.");
      }
      if (this.settings.linkMatchingVaultNotes && this.excludedVaultFoldersPersistedInvalid) {
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

      const people = preparePeopleIndexForImport(this.settings.linkMatchingVaultNotes, () => {
        progress.setMessage("Matching vault notes…");
        const peopleFiles: PeopleMarkdownFile[] = this.app.vault.getMarkdownFiles().map((file) => ({
          path: file.path,
          basename: file.basename,
          file,
          frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined
        }));
        return preparePeopleLinks(
          buildPeopleIndex(peopleFiles, this.settings.excludedVaultFolders),
          (target) => {
            if (!target.file) throw new Error(`Vault note is unavailable: ${target.path}`);
            const linkText = this.app.metadataCache.fileToLinktext(target.file, activeFile.path, true);
            return { linkText };
          }
        );
      });
      if (!this.settings.linkMatchingVaultNotes) {
        progress.setMessage("Skipping vault note matching…");
      }
      const rendered = renderCalendarBlockWithSummary(payload, people, this.settings);

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

      const editor = this.activeMarkdownEditor(activeFile);
      if (editor) {
        // Apply a targeted Editor change so unsaved buffer edits are retained.
        const editorContent = editor.getValue();
        const relocated = insertCalendarSection(editorContent, rendered.block);
        this.replaceEditorContent(editor, editorContent, relocated);
      } else {
        await this.app.vault.process(activeFile, (content) => insertCalendarSection(content, rendered.block));
      }
      finish(summarizeImportOutcome(targetDate, activeFile.basename, rendered.eventCount, rendered.linkCount, this.settings));
    } catch (error) {
      const message = error instanceof CalendarBridgeError
        ? error.message
        : error instanceof DailyNoteProviderError || error instanceof ActiveDailyNoteError || error instanceof CalendarInsertionError
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

    containerEl.createEl("h3", { text: "Formatting" });
    new Setting(containerEl)
      .setName("Event heading level")
      .setDesc("Each event title is rendered as a Markdown heading.")
      .addDropdown((dropdown) => {
        for (const level of [3, 4, 5, 6] as const) dropdown.addOption(String(level), `Heading ${level}`);
        dropdown
          .setValue(String(this.plugin.settings.eventHeadingLevel))
          .onChange((value) => { void this.commitEventHeadingLevel(dropdown, value); });
      });

    new Setting(containerEl)
      .setName("Time format")
      .setDesc("Timed events use the Calendar event's local timezone.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("24-hour", "24-hour — 09:00 – 09:30")
          .addOption("12-hour", "12-hour — 9:00 AM – 9:30 AM")
          .setValue(this.plugin.settings.timeFormat)
          .onChange((value) => { void this.commitTimeFormat(dropdown, value); });
      });

    new Setting(containerEl)
      .setName("Link matching vault notes")
      .setDesc("Add deterministic vault links for uniquely matched attendee names that appear in event titles.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.linkMatchingVaultNotes)
          .onChange((value) => { void this.commitBoolean(toggle, "linkMatchingVaultNotes", value); });
      });

    new Setting(containerEl)
      .setName("Link event titles to Calendar")
      .setDesc("Link event titles to Calendar when available; with an in-title vault link, add a separate Calendar link on the same line.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.linkEventTitles)
          .onChange((value) => { void this.commitBoolean(toggle, "linkEventTitles", value); });
      });

    containerEl.createEl("h3", { text: "Vault matching" });
    new Setting(containerEl)
      .setName("Vault folders to exclude")
      .setDesc("Optional vault-relative folders to skip when matching Calendar attendees; one path per line; exclusions include subfolders; blank searches all Markdown notes.")
      .addTextArea((text) => {
        text
          .setPlaceholder("Archive\nTemplates\nPrivate/People")
          .setValue(this.plugin.excludedVaultFoldersInput ?? this.plugin.settings.excludedVaultFolders.join("\n"));
        text.inputEl.addEventListener("blur", () => { void this.commitExcludedVaultFolders(text); });
      });

    containerEl.createEl("p", {
      text: "Open an existing configured Daily Note, then run the command; it updates that open note for its date and replaces the visible ## Calendar section under # Notes."
    });
  }

  private async commitEventHeadingLevel(dropdown: import("obsidian").DropdownComponent, value: string): Promise<void> {
    const previous = this.plugin.settings.eventHeadingLevel;
    const normalized = tryNormalizeEventHeadingLevel(value);
    if (!normalized) {
      dropdown.setValue(String(previous));
      new Notice("Choose an event heading level from Heading 3 through Heading 6.");
      return;
    }
    this.plugin.settings.eventHeadingLevel = normalized;
    try {
      await this.plugin.saveSettings();
    } catch (error) {
      this.plugin.settings.eventHeadingLevel = previous;
      dropdown.setValue(String(previous));
      new Notice(`Could not save the Event heading level: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async commitTimeFormat(dropdown: import("obsidian").DropdownComponent, value: string): Promise<void> {
    const previous = this.plugin.settings.timeFormat;
    const normalized = tryNormalizeTimeFormat(value);
    if (!normalized) {
      dropdown.setValue(previous);
      new Notice("Choose 24-hour or 12-hour time format.");
      return;
    }
    this.plugin.settings.timeFormat = normalized;
    try {
      await this.plugin.saveSettings();
    } catch (error) {
      this.plugin.settings.timeFormat = previous;
      dropdown.setValue(previous);
      new Notice(`Could not save the Time format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async commitBoolean(
    toggle: import("obsidian").ToggleComponent,
    key: "linkMatchingVaultNotes" | "linkEventTitles",
    value: boolean
  ): Promise<void> {
    const previous = this.plugin.settings[key];
    this.plugin.settings[key] = value;
    try {
      await this.plugin.saveSettings();
    } catch (error) {
      this.plugin.settings[key] = previous;
      toggle.setValue(previous);
      new Notice(`Could not save linking setting: ${error instanceof Error ? error.message : String(error)}`);
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
