import { Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from "obsidian";
import {
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings
} from "obsidian-daily-notes-interface";
import { fetchCalendarPayload, CalendarBridgeError } from "./calendarBridge";
import { buildPeopleIndex, preparePeopleLinks, type PeopleMarkdownFile } from "./invitees";
import { replaceCalendarBlock } from "./block";
import { renderCalendarBlock } from "./render";
import {
  DEFAULT_SETTINGS,
  normalizePeopleFolder,
  normalizeSectionHeading,
  type PluginSettings
} from "./settings";
import type { CalendarPayload } from "./types";
import { assertCoreDailyNotes, DailyNotesModeError } from "./dailyNotesGuard";
import { ensureDailyNotesFolder } from "./dailyNotesFolder";

export default class CalendarDailyNoteLinkerPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addCommand({
      id: "populate-todays-daily-note-with-calendar-events",
      name: "Populate today's Daily Note with Calendar events",
      callback: () => {
        void this.populateDailyNote();
      }
    });
    this.addSettingTab(new CalendarDailyNoteLinkerSettingTab(this.app, this));
  }

  private async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = {
      peopleFolder: normalizePeopleFolder(saved?.peopleFolder),
      sectionHeading: normalizeSectionHeading(saved?.sectionHeading)
    };
  }

  async saveSettings(): Promise<void> {
    this.settings.peopleFolder = normalizePeopleFolder(this.settings.peopleFolder);
    this.settings.sectionHeading = normalizeSectionHeading(this.settings.sectionHeading);
    await this.saveData(this.settings);
  }

  private async populateDailyNote(): Promise<void> {
    if (process.platform !== "darwin") {
      new Notice("Calendar Daily Note Linker requires macOS desktop and Calendar.app.");
      return;
    }

    let payload: CalendarPayload;
    try {
      // This deliberately happens before any Daily Note lookup or creation.
      payload = await fetchCalendarPayload();
    } catch (error) {
      const message = error instanceof CalendarBridgeError
        ? error.message
        : `Calendar access failed: ${error instanceof Error ? error.message : String(error)}`;
      new Notice(message, 10_000);
      return;
    }

    for (const warning of payload.warnings) {
      new Notice(`Calendar warning: ${warning}`, 8_000);
    }

    try {
      assertCoreDailyNotes(this.app);
    } catch (error) {
      new Notice(error instanceof DailyNotesModeError ? error.message : "Could not safely inspect Daily Notes. Enable the core Daily Notes plugin and try again.", 10_000);
      return;
    }

    let dailyNote: TFile | undefined;
    try {
      assertCoreDailyNotes(this.app);
      const dailySettings = getDailyNoteSettings();
      if (!dailySettings) {
        throw new Error("Daily Notes settings are unavailable.");
      }
      const today = (window.moment as unknown as (date: string, format: string, strict: boolean) => import("moment").Moment)(
        payload.targetDate,
        "YYYY-MM-DD",
        true
      );
      if (!today.isValid()) {
        throw new Error(`Calendar target date is invalid: ${payload.targetDate}`);
      }
      await ensureDailyNotesFolder(this.app.vault, dailySettings.folder ?? "", (file) => file instanceof TFolder);
      assertCoreDailyNotes(this.app);
      let dailyNotes = getAllDailyNotes();
      assertCoreDailyNotes(this.app);
      dailyNote = getDailyNote(today, dailyNotes);
      if (!dailyNote) {
        assertCoreDailyNotes(this.app);
        dailyNote = await createDailyNote(today);
        assertCoreDailyNotes(this.app);
        if (!dailyNote) {
          assertCoreDailyNotes(this.app);
          dailyNotes = getAllDailyNotes();
          assertCoreDailyNotes(this.app);
          dailyNote = getDailyNote(today, dailyNotes);
        }
      }
    } catch (error) {
      new Notice(
        `Daily Notes could not resolve or create today's note. Check the core Daily Notes settings and enable Daily Notes. ${error instanceof Error ? error.message : String(error)}`,
        10_000
      );
      return;
    }

    if (!dailyNote) {
      new Notice("Daily Notes did not provide today's note. Check that Daily Notes is enabled and configured.", 10_000);
      return;
    }

    try {
      const peopleFiles: PeopleMarkdownFile[] = this.app.vault.getMarkdownFiles().map((file) => ({
        path: file.path,
        basename: file.basename,
        file,
        frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined
      }));
      const people = preparePeopleLinks(
        buildPeopleIndex(peopleFiles, this.settings.peopleFolder),
        (target) => {
          if (!target.file) throw new Error(`People note is unavailable: ${target.path}`);
          return this.app.fileManager.generateMarkdownLink(
            target.file,
            dailyNote.path,
            undefined,
            target.basename || undefined
          );
        }
      );
      const block = renderCalendarBlock(payload, this.settings.sectionHeading, people);
      assertCoreDailyNotes(this.app);
      await this.app.vault.process(dailyNote, (content) => replaceCalendarBlock(content, block));
    } catch (error) {
      new Notice(
        `Today's Daily Note could not be updated: ${error instanceof Error ? error.message : String(error)}`,
        10_000
      );
      return;
    }

    new Notice("Today's Daily Note was updated with Calendar events.");
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

    new Setting(containerEl)
      .setName("People folder")
      .setDesc("Vault-relative folder to search recursively for Markdown People notes.")
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.peopleFolder)
        .setValue(this.plugin.settings.peopleFolder)
        .onChange(async (value) => {
          this.plugin.settings.peopleFolder = normalizePeopleFolder(value);
          text.setValue(this.plugin.settings.peopleFolder);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Section heading")
      .setDesc("Markdown heading used inside the managed Calendar section, for example ## Calendar.")
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.sectionHeading)
        .setValue(this.plugin.settings.sectionHeading)
        .onChange(async (value) => {
          this.plugin.settings.sectionHeading = normalizeSectionHeading(value);
          text.setValue(this.plugin.settings.sectionHeading);
          await this.plugin.saveSettings();
        }));
  }
}
