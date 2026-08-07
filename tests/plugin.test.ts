import { describe, expect, it } from "vitest";
import { replaceCalendarBlock } from "../src/block";
import { buildPeopleIndex, matchAttendee, matchEventPeople, preparePeopleLinks } from "../src/invitees";
import { renderCalendarBlock } from "../src/render";
import { normalizeExcludedVaultFolders, normalizeSectionHeading, parsePersistedExcludedVaultFolders, tryNormalizeExcludedVaultFolders, tryNormalizeSectionHeading } from "../src/settings";
import { validateCalendarPayload } from "../src/calendarPayload";
import { fetchCalendarPayload } from "../src/calendarBridge";
import { CALENDAR_EVENTS_SCRIPT } from "../src/calendarEventsSource";
import { assertCoreDailyNotes, getDailyNotesMode } from "../src/dailyNotesGuard";
import { ensureDailyNotesFolder } from "../src/dailyNotesFolder";
import { assertActiveDailyNoteUnchanged, resolveActiveDailyDate } from "../src/activeDailyNote";
import { summarizeImportOutcome } from "../src/summary";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import moment from "moment";
import type { CalendarEvent, CalendarPayload } from "../src/types";

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: null,
    calendar: "Work",
    title: "Event",
    start: "2025-01-15T14:00:00.000Z",
    end: "2025-01-15T15:00:00.000Z",
    allDay: false,
    url: null,
    location: null,
    notes: null,
    attendees: [],
    ...overrides
  };
}

function payload(events: CalendarEvent[]): CalendarPayload {
  return {
    schemaVersion: 1,
    source: "Calendar.app",
    targetDate: "2025-01-15",
    range: {
      start: "2025-01-15T05:00:00.000Z",
      end: "2025-01-16T05:00:00.000Z",
      timeZone: "America/New_York"
    },
    events,
    warnings: []
  };
}

describe("People matching", () => {
  it("lets a unique email match outrank a display-name match", () => {
    const index = buildPeopleIndex([
      { path: "People/Ada Email.md", basename: "Ada Email", frontmatter: { email: "ada@example.com" } },
      { path: "People/Ada Name.md", basename: "Ada Name", frontmatter: { aliases: ["Ada Lovelace"] } }
    ], []);

    expect(matchAttendee(index, { email: " ADA@EXAMPLE.COM ", displayName: "Ada Lovelace" })?.path)
      .toBe("People/Ada Email.md");
  });

  it("does not link an ambiguous name", () => {
    const index = buildPeopleIndex([
      { path: "People/Team One/Ada.md", basename: "Ada", frontmatter: {} },
      { path: "People/Team Two/Ada.md", basename: "Ada", frontmatter: {} }
    ], []);

    expect(matchAttendee(index, { email: null, displayName: "  ADA  " })).toBeNull();
  });

  it("indexes aliases and nested People paths", () => {
    const index = buildPeopleIndex([
      {
        path: "People/Engineering/Ada Lovelace.md",
        basename: "Ada Lovelace",
        frontmatter: { aliases: ["The Enchantress"], emails: ["ada@engine.example"] }
      }
    ], []);

    expect(matchAttendee(index, { email: "ada@engine.example", displayName: null })?.path)
      .toBe("People/Engineering/Ada Lovelace.md");
    expect(matchAttendee(index, { email: null, displayName: "the   enchantress" })?.path)
      .toBe("People/Engineering/Ada Lovelace.md");
  });
});

describe("Calendar rendering", () => {
  it("uses the target date rather than today in an empty historical block", () => {
    expect(renderCalendarBlock(payload([]), "## Calendar", buildPeopleIndex([], [])))
      .toContain("No Calendar events found for 2025-01-15.");
  });

  it("puts all-day events first and renders timed events in local time", () => {
    const people = buildPeopleIndex([], []);
    const rendered = renderCalendarBlock(payload([
      event({ title: "Timed early", start: "2025-01-15T13:00:00.000Z", end: "2025-01-15T14:00:00.000Z" }),
      event({ title: "All day", allDay: true, start: "2025-01-15T05:00:00.000Z", end: "2025-01-16T05:00:00.000Z" }),
      event({ title: "Timed late", start: "2025-01-15T16:00:00.000Z", end: "2025-01-15T17:30:00.000Z" })
    ]), "## Calendar", people);

    expect(rendered.indexOf("All day")).toBeLessThan(rendered.indexOf("Timed early"));
    expect(rendered).toContain("Timed early — 8:00 AM–9:00 AM");
    expect(rendered).toContain("Timed late — 11:00 AM–12:30 PM");
  });

  it("escapes a URL while retaining it as the title link", () => {
    const rendered = renderCalendarBlock(payload([
      event({ title: "Project [review]", url: "https://example.com/a_(b)?q=1" })
    ]), "## Calendar", buildPeopleIndex([], []));

    expect(rendered).toContain("[Project \\[review\\]](https://example.com/a_\\(b\\)?q=1)");
  });

  it("sanitizes hostile Calendar lines and cannot emit marker literals", () => {
    const rendered = renderCalendarBlock(payload([
      event({
        title: "Title\n<!-- calendar-daily-note-linker:start -->\nunsafe",
        url: "https://example.com/<!-- calendar-daily-note-linker:end -->"
      })
    ]), "## Calendar", buildPeopleIndex([], []));

    const body = rendered
      .slice("<!-- calendar-daily-note-linker:start -->".length)
      .slice(0, -"<!-- calendar-daily-note-linker:end -->".length);
    expect(body).not.toContain("<!-- calendar-daily-note-linker:start -->\nunsafe");
    expect(body).not.toContain("<!-- calendar-daily-note-linker:end -->");
    expect(rendered.split("\n").every((line) => line === line.trimEnd())).toBe(true);
  });

  it("treats HTML, Markdown syntax, controls, and Unicode separators as plain title text", () => {
    const rendered = renderCalendarBlock(payload([event({
      title: "<b>& *bold* _italic_ [link](evil) # heading\0\u0007line\u2028next\u2029last"
    })]), "## Calendar", buildPeopleIndex([], []));

    expect(rendered).toContain("&lt;b&gt;&amp; \\*bold\\* \\_italic\\_ \\[link\\]\\(evil\\) \\# headingline next last");
    expect(rendered).not.toContain("<b>");
    expect(rendered).not.toContain("\u0000");
    expect(rendered).not.toContain("\u2028");
    expect(rendered).not.toContain("\u2029");
  });

  it("accepts only safe HTTP URLs and neutralizes suspicious destination punctuation", () => {
    const safe = renderCalendarBlock(payload([event({
      title: "Safe",
      url: "https://example.com/a) [not-a-link](javascript:alert(1))?x=1"
    })]), "## Calendar", buildPeopleIndex([], []));
    expect(safe).toContain("https://example.com/a\\)%20[not-a-link]\\(javascript:alert\\(1\\)\\)?x=1");
    expect(safe).not.toContain("](javascript:");

    const invalid = renderCalendarBlock(payload([event({ title: "No link", url: "javascript:alert(1)" })]), "## Calendar", buildPeopleIndex([], []));
    expect(invalid).toContain("- No link —");
    expect(invalid).not.toContain("[No link](");
  });

  it("uses a unique title fallback only when attendees produced no links", () => {
    const index = preparePeopleLinks(buildPeopleIndex([
      { path: "Projects/Project.md", basename: "Project", frontmatter: {} },
      { path: "People/Ada.md", basename: "Ada", frontmatter: { aliases: ["Ada Lovelace"] } }
    ], []), (target) => `[[${target.path}|${target.basename}]]`);
    const titleFallback = renderCalendarBlock(payload([event({ title: "Project" })]), "## Calendar", index);
    expect(titleFallback).toContain("[[Projects/Project.md|Project]]");

    const attendeeWins = renderCalendarBlock(payload([event({
      title: "Project",
      attendees: [{ displayName: "Ada Lovelace", email: null, status: null }]
    })]), "## Calendar", index);
    expect(attendeeWins).toContain("[[People/Ada.md|Ada]]");
    expect(attendeeWins).not.toContain("[[Projects/Project.md|Project]]");

    const ambiguous = buildPeopleIndex([
      { path: "One/Project.md", basename: "Project", frontmatter: {} },
      { path: "Two/Project.md", basename: "Project", frontmatter: {} }
    ], []);
    expect(matchEventPeople(ambiguous, [], "Project")).toEqual([]);
  });
});

describe("managed block replacement", () => {
  it("preserves unrelated note contents on first and subsequent runs", () => {
    const block = "<!-- calendar-daily-note-linker:start -->\n## Calendar\n- New\n<!-- calendar-daily-note-linker:end -->";
    const original = "# My day\n\nPrivate planning.\n";
    const first = replaceCalendarBlock(original, block);
    expect(first).toBe(`${original}${block}\n`);

    const withOldBlock = `${first}\nMore private notes.`;
    const second = replaceCalendarBlock(withOldBlock, block.replace("- New", "- Updated"));
    expect(second).toContain("# My day\n\nPrivate planning.");
    expect(second).toContain("- Updated");
    expect(second).toContain("More private notes.");
    expect(second).not.toContain("- New");
  });

  it.each([
    "<!-- calendar-daily-note-linker:start -->\ntext",
    "<!-- calendar-daily-note-linker:end -->\ntext",
    "<!-- calendar-daily-note-linker:start -->\nold\n<!-- calendar-daily-note-linker:start -->\nold\n<!-- calendar-daily-note-linker:end -->",
    "before\n  <!-- calendar-daily-note-linker:start -->\ntext\n<!-- calendar-daily-note-linker:end -->"
  ])("rejects malformed marker state without changing the note: %s", (note) => {
    const block = "<!-- calendar-daily-note-linker:start -->\n## Calendar\n- New\n<!-- calendar-daily-note-linker:end -->";
    const original = note;
    expect(() => replaceCalendarBlock(note, block)).toThrow();
    expect(note).toBe(original);
  });
});

describe("People links and settings", () => {
  it("preserves special file paths while using prepared generated links", () => {
    const index = buildPeopleIndex([{
      path: "People/Team [A]/Ada | Lovelace.md",
      basename: "Ada | Lovelace",
      file: {} as never,
      frontmatter: { aliases: ["The Enchantress"] }
    }], []);
    const linked = preparePeopleLinks(index, (target) => `[[${target.path.replaceAll("|", "\\|")}|${target.basename.replaceAll("|", "\\|")}]]`);
    const rendered = renderCalendarBlock(payload([event({
      title: "Meet Ada",
      attendees: [{ displayName: "The Enchantress", email: null, status: null }]
    })]), "## Calendar", linked);

    expect(rendered).toContain("[[People/Team [A]/Ada \\| Lovelace.md|Ada \\| Lovelace]]");
  });

  it("normalizes exclusions and rejects unsafe paths", () => {
    expect(normalizeExcludedVaultFolders("  Archive  \n~\\Private People\n\n")).toEqual(["  Archive  ", "~/Private People"]);
    expect(tryNormalizeExcludedVaultFolders(["Valid", "../bad"])).toBeUndefined();
    expect(tryNormalizeExcludedVaultFolders(["Private\nArchive"])).toBeUndefined();
    expect(tryNormalizeExcludedVaultFolders(["Private\u2028Archive"])).toBeUndefined();
    expect(tryNormalizeExcludedVaultFolders(["Private\u0001Archive"])).toBeUndefined();
    expect(parsePersistedExcludedVaultFolders(["Valid", "Private\nArchive"])).toEqual({
      folders: [],
      malformed: true,
      rawInput: "Valid\nPrivate\nArchive"
    });
    expect(() => normalizeExcludedVaultFolders("/Other")).toThrow();
    expect(() => normalizeExcludedVaultFolders("People//Team")).toThrow();
    expect(() => normalizeExcludedVaultFolders("People/../Other")).toThrow();
  });

  it("supports vault-wide matching, nested exclusions, and folder boundaries", () => {
    const index = buildPeopleIndex([
      { path: "Archive/Ada.md", basename: "Ada", frontmatter: {} },
      { path: "Archive/Nested/Project.md", basename: "Project", frontmatter: {} },
      { path: "ArchiveX/Ada.md", basename: "Ada", frontmatter: {} },
      { path: "Project.md", basename: "Project", frontmatter: { aliases: ["Build"] } }
    ], ["Archive"]);
    expect(matchAttendee(index, { email: null, displayName: "Project" })?.path).toBe("Project.md");
    expect(matchAttendee(index, { email: null, displayName: "Ada" })?.path).toBe("ArchiveX/Ada.md");
    expect(matchAttendee(index, { email: null, displayName: "Build" })?.path).toBe("Project.md");
  });

  it("distinguishes valid completed headings from invalid input without a defaulting side effect", () => {
    expect(tryNormalizeSectionHeading("  ###  Daily Notes  ")).toBe("### Daily Notes");
    expect(normalizeSectionHeading("  ###  Daily Notes  ")).toBe("### Daily Notes");
    expect(tryNormalizeSectionHeading("#")).toBeUndefined();
    expect(tryNormalizeSectionHeading("Calendar")).toBeUndefined();
    expect(normalizeSectionHeading("Calendar")).toBe("## Calendar");
  });
});

describe("Daily Notes folder preparation", () => {
  it("creates missing parent folders and tolerates a creation race", async () => {
    const folders = new Set<string>();
    const created: string[] = [];
    const vault = {
      getAbstractFileByPath: (path: string) => folders.has(path) ? { kind: "folder" } : null,
      createFolder: async (path: string) => {
        created.push(path);
        folders.add(path);
      }
    };

    await ensureDailyNotesFolder(vault, "Journal/Daily Notes", (file) => (file as { kind: string }).kind === "folder");
    expect(created).toEqual(["Journal", "Journal/Daily Notes"]);

    let firstAttempt = true;
    await ensureDailyNotesFolder({
      getAbstractFileByPath: (path: string) => path === "Raced" && !firstAttempt ? { kind: "folder" } : null,
      createFolder: async () => {
        firstAttempt = false;
        throw new Error("already exists");
      }
    }, "Raced", (file) => (file as { kind: string }).kind === "folder");
    expect(firstAttempt).toBe(false);
  });
});

describe("bridge and payload safety", () => {
  it("invokes osascript with the bundled source and validates targetDate", async () => {
    let executable = "";
    let args: string[] = [];
    const result = await fetchCalendarPayload("2025-01-15", async (command, commandArgs) => {
      executable = command;
      args = commandArgs;
      return {
        stdout: JSON.stringify(payload([])),
        stderr: ""
      };
    });

    expect(executable).toBe("/usr/bin/osascript");
    expect(args.slice(0, 3)).toEqual(["-l", "JavaScript", "-e"]);
    expect(args[3]).toBe(CALENDAR_EVENTS_SCRIPT);
    expect(args[4]).toBe("2025-01-15");
    expect(result.targetDate).toBe("2025-01-15");
  });

  it("rejects invalid bridge date arguments before spawning", async () => {
    await expect(fetchCalendarPayload("2025-02-30", async () => {
      throw new Error("runner must not be called");
    })).rejects.toThrow(/valid calendar date/);
  });

  it("rejects an invalid target date and non-attendee warnings", () => {
    expect(() => validateCalendarPayload({ ...payload([]), targetDate: "2025-02-30" })).toThrow(/targetDate/);
    expect(() => validateCalendarPayload({ ...payload([]), warnings: ["Calendar enumeration failed"] })).toThrow(/warnings/);
  });

  it("keeps the JXA source strict for non-attendee properties", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/calendar-events.js"), "utf8");
    expect(source).toContain("function readEventProperty");
    expect(source).toContain('readEventProperty(calendar, "name")');
    expect(source).toContain("participationStatus");
    expect(source).toContain("typeof allDay !== \"boolean\"");
    expect(source).not.toContain("function readProperty");
    expect(source).not.toContain("eventValue(event");
    expect(source).not.toContain('readEventProperty(event, "calendar")');
    expect(source).not.toContain("calendarName(event)");
  });
});

describe("Daily Notes compatibility guard", () => {
  it("requires core Daily Notes and rejects Periodic Notes daily mode", () => {
    expect(getDailyNotesMode({ internalPlugins: { plugins: {} }, plugins: {} })).toBe("disabled");
    expect(getDailyNotesMode({
      internalPlugins: { plugins: { "daily-notes": { enabled: true } } },
      plugins: { getPlugin: () => ({ settings: { daily: { enabled: true } } }) }
    })).toBe("periodic");
    expect(getDailyNotesMode({
      internalPlugins: { plugins: { "daily-notes": { enabled: true } } },
      plugins: { getPlugin: () => undefined }
    })).toBe("core");
    expect(() => assertCoreDailyNotes({ internalPlugins: { plugins: {} }, plugins: {} })).toThrow();
    expect(() => assertCoreDailyNotes({
      internalPlugins: { plugins: { "daily-notes": { enabled: true } } },
      plugins: { getPlugin: () => ({ settings: { daily: { enabled: true } } }) }
    })).toThrow(/Periodic Notes/);
    expect(() => assertCoreDailyNotes({
      internalPlugins: { plugins: { "daily-notes": { enabled: true } } },
      plugins: { getPlugin: () => undefined }
    })).not.toThrow();
  });
});

describe("active Daily Note resolution and outcome summaries", () => {
  const settings = { folder: "Journal/Daily", format: "YYYY-MM-DD" };
  const file = { path: "Journal/Daily/2025-01-14.md", basename: "2025-01-14", extension: "md" };
  const parseMoment = (stem: string, format: string, strict = true) => moment(stem, format, strict);
  const createMoment = (isoDate: string) => moment(isoDate, "YYYY-MM-DD", true);

  it("uses the active filename date and enforces the configured folder boundary", () => {
    expect(resolveActiveDailyDate(file, settings, parseMoment, undefined, createMoment)).toBe("2025-01-14");
    expect(() => resolveActiveDailyDate({ ...file, path: "Journal/DailyArchive/2025-01-14.md" }, settings, parseMoment, undefined, createMoment)).toThrow(/outside/);
    expect(() => resolveActiveDailyDate({ ...file, extension: "canvas" }, settings, parseMoment, undefined, createMoment)).toThrow(/existing core/);
  });

  it("rejects ambiguous configured formats with real Moment parsing", () => {
    expect(() => resolveActiveDailyDate(file, { folder: "Journal/Daily", format: "YYYY-MM" }, parseMoment, undefined, createMoment)).toThrow(/identify one/);
    expect(() => resolveActiveDailyDate(file, { folder: "Journal/Daily", format: "YYYY-DD" }, parseMoment, undefined, createMoment)).toThrow(/identify one/);
    for (const format of ["YYYY-MD", "YYYY-M[]D", "YYYY-M[1]D"]) {
      const relativeStem = moment("2025-01-12").format(format);
      const ambiguousFile = { path: `Journal/Daily/${relativeStem}.md`, basename: relativeStem, extension: "md" };
      expect(() => resolveActiveDailyDate(ambiguousFile, { folder: "Journal/Daily", format }, parseMoment, undefined, createMoment)).toThrow(/more than one/);
    }
    const yyStem = moment("2025-01-14").format("YY-MM-DD");
    expect(() => resolveActiveDailyDate({ ...file, path: `Journal/Daily/${yyStem}.md`, basename: yyStem }, { folder: "Journal/Daily", format: "YY-MM-DD" }, parseMoment, undefined, createMoment)).toThrow(/identify one/);
  });

  it("validates the complete configured path for distributed formats", () => {
    const distributedFile = { path: "Journal/2025/01/14.md", basename: "14", extension: "md" };
    expect(resolveActiveDailyDate(distributedFile, { folder: "Journal", format: "YYYY/MM/DD" }, parseMoment, undefined, createMoment)).toBe("2025-01-14");
    expect(() => resolveActiveDailyDate({ ...distributedFile, path: "Journal/2025/01/14/Extra.md" }, { folder: "Journal", format: "YYYY/MM/DD" }, parseMoment, undefined, createMoment)).toThrow(/canonical|more than one/);
    expect(() => resolveActiveDailyDate({ ...distributedFile, path: "JournalExtra/2025/01/14.md" }, { folder: "Journal", format: "YYYY/MM/DD" }, parseMoment, undefined, createMoment)).toThrow(/outside/);
  });

  it("accepts the fixed-boundary YYYY M DD format", () => {
    const date = moment("2025-01-23");
    const relativeStem = date.format("YYYYMDD");
    const fixedFile = { path: `Journal/Daily/${relativeStem}.md`, basename: relativeStem, extension: "md" };
    expect(resolveActiveDailyDate(fixedFile, { folder: "Journal/Daily", format: "YYYYMDD" }, parseMoment, () => null, createMoment)).toBe("2025-01-23");
  });

  it("uses the specified outcome summary variants", () => {
    expect(summarizeImportOutcome("2025-01-14", "2025-01-14", 0, 0))
      .toBe("No Calendar events found for 2025-01-14. The active Daily Note was updated.");
    expect(summarizeImportOutcome("2025-01-14", "2025-01-14", 2, 0))
      .toBe("Imported 2 Calendar events into 2025-01-14. No attendees or event titles uniquely matched vault notes.");
    expect(summarizeImportOutcome("2025-01-14", "2025-01-14", 2, 3))
      .toBe("Imported 2 Calendar events into 2025-01-14 and added 3 vault links.");
    expect(summarizeImportOutcome("2025-01-14", "2025-01-14", 1, 1))
      .toBe("Imported 1 Calendar event into 2025-01-14 and added 1 vault link.");
  });

  it("rejects active-file identity, path, date, and configuration changes", () => {
    const currentSettings = { folder: "Journal/Daily", format: "YYYY-MM-DD", template: "" };
    assertActiveDailyNoteUnchanged(file, file, currentSettings, currentSettings, "2025-01-14", "2025-01-14");
    expect(() => assertActiveDailyNoteUnchanged(file, { ...file }, currentSettings, currentSettings, "2025-01-14", "2025-01-14")).toThrow(/changed/);
    expect(() => assertActiveDailyNoteUnchanged(file, file, currentSettings, { ...currentSettings, format: "YYYY/MM/DD" }, "2025-01-14", "2025-01-14")).toThrow(/configuration/);
    expect(() => assertActiveDailyNoteUnchanged(file, file, currentSettings, currentSettings, "2025-01-14", "2025-01-15")).toThrow(/configuration/);
  });
});
