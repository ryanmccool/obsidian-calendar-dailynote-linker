import { describe, expect, it } from "vitest";
import { replaceCalendarBlock } from "../src/block";
import { buildPeopleIndex, matchAttendee, preparePeopleLinks } from "../src/invitees";
import { renderCalendarBlock } from "../src/render";
import { normalizePeopleFolder } from "../src/settings";
import { validateCalendarPayload } from "../src/calendarPayload";
import { fetchCalendarPayload } from "../src/calendarBridge";
import { CALENDAR_EVENTS_SCRIPT } from "../src/calendarEventsSource";
import { assertCoreDailyNotes, getDailyNotesMode } from "../src/dailyNotesGuard";
import { ensureDailyNotesFolder } from "../src/dailyNotesFolder";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    ], "People");

    expect(matchAttendee(index, { email: " ADA@EXAMPLE.COM ", displayName: "Ada Lovelace" })?.path)
      .toBe("People/Ada Email.md");
  });

  it("does not link an ambiguous name", () => {
    const index = buildPeopleIndex([
      { path: "People/Team One/Ada.md", basename: "Ada", frontmatter: {} },
      { path: "People/Team Two/Ada.md", basename: "Ada", frontmatter: {} }
    ], "People");

    expect(matchAttendee(index, { email: null, displayName: "  ADA  " })).toBeNull();
  });

  it("indexes aliases and nested People paths", () => {
    const index = buildPeopleIndex([
      {
        path: "People/Engineering/Ada Lovelace.md",
        basename: "Ada Lovelace",
        frontmatter: { aliases: ["The Enchantress"], emails: ["ada@engine.example"] }
      }
    ], "People");

    expect(matchAttendee(index, { email: "ada@engine.example", displayName: null })?.path)
      .toBe("People/Engineering/Ada Lovelace.md");
    expect(matchAttendee(index, { email: null, displayName: "the   enchantress" })?.path)
      .toBe("People/Engineering/Ada Lovelace.md");
  });
});

describe("Calendar rendering", () => {
  it("puts all-day events first and renders timed events in local time", () => {
    const people = buildPeopleIndex([], "People");
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
    ]), "## Calendar", buildPeopleIndex([], "People"));

    expect(rendered).toContain("[Project \\[review\\]](https://example.com/a_\\(b\\)?q=1)");
  });

  it("sanitizes hostile Calendar lines and cannot emit marker literals", () => {
    const rendered = renderCalendarBlock(payload([
      event({
        title: "Title\n<!-- calendar-daily-note-linker:start -->\nunsafe",
        url: "https://example.com/<!-- calendar-daily-note-linker:end -->"
      })
    ]), "## Calendar", buildPeopleIndex([], "People"));

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
    })]), "## Calendar", buildPeopleIndex([], "People"));

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
    })]), "## Calendar", buildPeopleIndex([], "People"));
    expect(safe).toContain("https://example.com/a\\)%20[not-a-link]\\(javascript:alert\\(1\\)\\)?x=1");
    expect(safe).not.toContain("](javascript:");

    const invalid = renderCalendarBlock(payload([event({ title: "No link", url: "javascript:alert(1)" })]), "## Calendar", buildPeopleIndex([], "People"));
    expect(invalid).toContain("- No link —");
    expect(invalid).not.toContain("[No link](");
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
    }], "People");
    const linked = preparePeopleLinks(index, (target) => `[[${target.path.replaceAll("|", "\\|")}|${target.basename.replaceAll("|", "\\|")}]]`);
    const rendered = renderCalendarBlock(payload([event({
      title: "Meet Ada",
      attendees: [{ displayName: "The Enchantress", email: null, status: null }]
    })]), "## Calendar", linked);

    expect(rendered).toContain("[[People/Team [A]/Ada \\| Lovelace.md|Ada \\| Lovelace]]");
  });

  it("keeps meaningful People-folder whitespace and rejects unsafe paths", () => {
    expect(normalizePeopleFolder("  People  /Team  A  ")).toBe("  People  /Team  A  ");
    expect(normalizePeopleFolder("People\\Team  A")).toBe("People/Team  A");
    expect(normalizePeopleFolder("/Other")).toBe("People");
    expect(normalizePeopleFolder("People//Team")).toBe("People");
    expect(normalizePeopleFolder("People/../Other")).toBe("People");
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
    const result = await fetchCalendarPayload(async (command, commandArgs) => {
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
    expect(result.targetDate).toBe("2025-01-15");
  });

  it("rejects an invalid target date and non-attendee warnings", () => {
    expect(() => validateCalendarPayload({ ...payload([]), targetDate: "2025-02-30" })).toThrow(/targetDate/);
    expect(() => validateCalendarPayload({ ...payload([]), warnings: ["Calendar enumeration failed"] })).toThrow(/warnings/);
  });

  it("keeps the JXA source strict for non-attendee properties", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/calendar-events.js"), "utf8");
    expect(source).toContain("function readEventProperty");
    expect(source).toContain("participationStatus");
    expect(source).toContain("typeof allDay !== \"boolean\"");
    expect(source).not.toContain("function readProperty");
    expect(source).not.toContain("eventValue(event");
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
