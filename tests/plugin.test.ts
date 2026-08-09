import { describe, expect, it } from "vitest";
import { replaceCalendarBlock } from "../src/block";
import { buildPeopleIndex, matchAttendee, preparePeopleIndexForImport, preparePeopleLinks } from "../src/invitees";
import { renderCalendarBlock, renderCalendarBlockWithSummary } from "../src/render";
import { normalizeExcludedVaultFolders, normalizeSectionHeading, parsePersistedExcludedVaultFolders, parsePersistedPluginSettings, tryNormalizeEventHeadingLevel, tryNormalizeExcludedVaultFolders, tryNormalizeInsertionHeading, tryNormalizeSectionHeading, tryNormalizeSelectedCalendarIds } from "../src/settings";
import { insertCalendarSection, relocateCalendarBlockAtCursor } from "../src/insertion";
import { parseStandaloneAtxHeadings } from "../src/markdown";
import { validateCalendarPayload } from "../src/calendarPayload";
import { CalendarBridgeError, fetchAvailableCalendars, fetchCalendarPayload } from "../src/calendarBridge";
import { CALENDAR_EVENTS_SCRIPT } from "../src/calendarEventsSource";
import {
  assertSameDailyNoteProvider,
  getDailyNoteProviderCandidates,
  inspectDailyNoteProviders,
  resolveActiveDailyNoteProvider
} from "../src/dailyNoteProviders";
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
    source: "EventKit",
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

function preparedPeople(index: ReturnType<typeof buildPeopleIndex>, omitMdExtension = false) {
  return preparePeopleLinks(index, (target) => ({
    linkText: omitMdExtension && target.path.toLowerCase().endsWith(".md")
      ? target.path.slice(0, -3)
      : target.path
  }));
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

  it("does not load a vault index when matching links are disabled", () => {
    let loads = 0;
    const disabled = preparePeopleIndexForImport(false, () => {
      loads += 1;
      return buildPeopleIndex([{ path: "People/Ada.md", basename: "Ada", frontmatter: {} }], ["../invalid"]);
    });
    expect(loads).toBe(0);
    expect(disabled.byEmail.size).toBe(0);
    expect(disabled.byName.size).toBe(0);

    preparePeopleIndexForImport(true, () => {
      loads += 1;
      return buildPeopleIndex([], []);
    });
    expect(loads).toBe(1);
  });
});

describe("Calendar rendering", () => {
  it("renders the default events as a visible two-line Heading 3 and 24-hour entry", () => {
    const rendered = renderCalendarBlockWithSummary(payload([
      event({ title: "Mike - Ryan catchup", start: "2025-01-15T14:00:00.000Z", end: "2025-01-15T14:30:00.000Z" })
    ]), buildPeopleIndex([], []));

    expect(rendered.block).toBe([
      "## Calendar",
      "### Mike - Ryan catchup",
      "09:00 – 09:30",
    ].join("\n"));
  });

  it("supports event Heading 3 and 12-hour formatting", () => {
    const rendered = renderCalendarBlockWithSummary(payload([
      event({ title: "Planning", start: "2025-01-15T14:00:00.000Z", end: "2025-01-15T15:30:00.000Z" })
    ]), buildPeopleIndex([], []), {
      eventHeadingLevel: 3,
      timeFormat: "12-hour",
      linkMatchingVaultNotes: true,
      linkEventTitles: true
    });

    expect(rendered.block).toContain("### Planning\n9:00 AM – 10:30 AM");
  });

  it("renders all-day events on the second line", () => {
    const rendered = renderCalendarBlockWithSummary(payload([
      event({ title: "Company holiday", allDay: true })
    ]), buildPeopleIndex([], []));
    expect(rendered.block).toContain("### Company holiday\nAll day");
  });

  it("deduplicates normalized all-day duplicates across calendar names and preserves the first occurrence", () => {
    const events = [
      event({
        id: "first",
        calendar: "Work",
        title: "OOO",
        start: "2025-01-15T05:00:00.000Z",
        end: "2025-01-16T05:00:00.000Z",
        allDay: true,
        url: " HTTPS://EXAMPLE.COM/ooo ",
        attendees: [
          { email: "ALICE@EXAMPLE.COM", displayName: "Alice Smith", status: "accepted" },
          { email: "BOB@EXAMPLE.COM", displayName: "Bob Smith", status: "accepted" }
        ]
      }),
      event({
        id: "mirror",
        calendar: "Personal",
        title: "  ooo  ",
        start: "2025-01-15T05:00:00.000Z",
        end: "2025-01-16T05:00:00.000Z",
        allDay: true,
        url: "https://example.com/ooo",
        attendees: [
          { email: " bob@example.com ", displayName: " bob   smith ", status: "declined" },
          { email: " alice@example.com ", displayName: " alice smith ", status: "tentative" }
        ]
      })
    ];
    const modern = renderCalendarBlockWithSummary(payload(events), buildPeopleIndex([], []));
    const legacy = renderCalendarBlockWithSummary(payload(events), "## Calendar", buildPeopleIndex([], []));

    expect(modern.eventCount).toBe(1);
    expect(legacy.eventCount).toBe(1);
    expect(modern.linkCount).toBe(0);
    expect(legacy.linkCount).toBe(0);
    expect(modern.block).toContain("### [OOO](https://example.com/ooo)\nAll day");
    expect(legacy.block).toContain("[OOO](https://example.com/ooo)\nAll day");
  });

  it("keeps distinct same-time events separate when any deduplication field differs", () => {
    const base = event({
      title: "Same",
      start: "2025-01-15T14:00:00.000Z",
      end: "2025-01-15T15:00:00.000Z",
      allDay: false,
      attendees: [{ email: "ada@example.com", displayName: "Ada", status: "accepted" }]
    });
    const events = [
      base,
      event({ ...base, id: "url", url: "https://example.com/one" }),
      event({ ...base, id: "attendee", attendees: [{ email: "bob@example.com", displayName: "Bob", status: "accepted" }] }),
      event({ ...base, id: "title", title: "Other" }),
      event({ ...base, id: "end", end: "2025-01-15T15:30:00.000Z" }),
      event({ ...base, id: "all-day", allDay: true })
    ];
    const modern = renderCalendarBlockWithSummary(payload(events), buildPeopleIndex([], []));
    const legacy = renderCalendarBlockWithSummary(payload(events), "## Calendar", buildPeopleIndex([], []));

    expect(modern.eventCount).toBe(6);
    expect(legacy.eventCount).toBe(6);
    expect(modern.block).toContain("### Same\n09:00 – 10:00");
    expect(modern.block).toContain("### Other\n09:00 – 10:00");
  });

  it("deduplicates before sorting while preserving attendee title links in both paths", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Randy Swensen.md", basename: "Randy Swensen", frontmatter: {} },
      { path: "People/Ryan Chen.md", basename: "Ryan Chen", frontmatter: {} }
    ], []), true);
    const events = [
      event({
        id: "first",
        calendar: "Work",
        title: "Randy and Ryan",
        start: "2025-01-15T13:00:00.000Z",
        end: "2025-01-15T14:00:00.000Z",
        attendees: [
          { email: null, displayName: "Randy Swensen", status: "accepted" },
          { email: null, displayName: "Ryan Chen", status: "accepted" }
        ]
      }),
      event({
        id: "mirror",
        calendar: "Personal",
        title: " randy   AND  ryan ",
        start: "2025-01-15T13:00:00.000Z",
        end: "2025-01-15T14:00:00.000Z",
        attendees: [
          { email: null, displayName: " rYaN   cHeN ", status: "declined" },
          { email: null, displayName: " rAnDy swensen ", status: "tentative" }
        ]
      }),
      event({ title: "Later", start: "2025-01-15T16:00:00.000Z", end: "2025-01-15T17:00:00.000Z" })
    ];
    const modern = renderCalendarBlockWithSummary(payload(events), people);
    const legacy = renderCalendarBlockWithSummary(payload(events), "## Calendar", people);

    expect(modern.eventCount).toBe(2);
    expect(legacy.eventCount).toBe(2);
    expect(modern.linkCount).toBe(2);
    expect(legacy.linkCount).toBe(2);
    expect(modern.block).toContain("### [[People/Randy Swensen|Randy]] and [[People/Ryan Chen|Ryan]]\n08:00 – 09:00");
    expect(legacy.block).toContain("### [[People/Randy Swensen|Randy]] and [[People/Ryan Chen|Ryan]]\n8:00 AM–9:00 AM");
    expect(modern.block.indexOf("Randy")).toBeLessThan(modern.block.indexOf("Later"));
    expect(legacy.block.indexOf("Randy")).toBeLessThan(legacy.block.indexOf("Later"));
  });

  it("keeps attendee wikilinks separate from Calendar URLs and honors link toggles", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Mike.md", basename: "Mike", frontmatter: {} }
    ], []));
    const linked = renderCalendarBlockWithSummary(payload([event({
      title: "Mike",
      url: "https://example.com/a_(b)?q=1",
      attendees: [{ displayName: "Mike", email: null, status: "unknown" }]
    })]), people);
    expect(linked.block).toContain("### [[People/Mike.md|Mike]] · [Calendar](https://example.com/a_\\(b\\)?q=1)");
    expect(linked.block).not.toContain("[[[");

    const unlinked = renderCalendarBlockWithSummary(payload([event({
      title: "Mike",
      url: "https://example.com/a_(b)?q=1",
      attendees: [{ displayName: "Mike", email: null, status: "unknown" }]
    })]), people, {
      eventHeadingLevel: 3,
      timeFormat: "24-hour",
      linkMatchingVaultNotes: false,
      linkEventTitles: false
    });
    expect(unlinked.block).toContain("### Mike\n");
    expect(unlinked.block).not.toContain("People/Mike");
    expect(unlinked.block).not.toContain("https://example.com/a_");
    expect(unlinked.block).not.toContain("[Calendar]");

    const matchingDisabled = renderCalendarBlockWithSummary(payload([event({
      title: "Mike",
      url: "https://example.com/event"
    })]), { byEmail: new Map(), byName: new Map() }, {
      linkMatchingVaultNotes: false,
      linkEventTitles: true
    });
    expect(matchingDisabled.block).toContain("### [Mike](https://example.com/event)");
  });

  it("links a short attendee-name component in the title", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Randy Swensen.md", basename: "Randy Swensen", frontmatter: {} }
    ], []), true);
    const rendered = renderCalendarBlockWithSummary(payload([event({
      title: "Randy - Ryan chat",
      attendees: [{ displayName: "Randy Swensen", email: null, status: "unknown" }]
    })]), people);

    expect(rendered.block).toContain("### [[People/Randy Swensen|Randy]] - Ryan chat\n09:00 – 10:00");
    expect(rendered.linkCount).toBe(1);
  });

  it("links a full attendee name and preserves its original spacing", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Randy Swensen.md", basename: "Randy Swensen", frontmatter: {} }
    ], []), true);
    const rendered = renderCalendarBlockWithSummary(payload([event({
      title: "Meet randy   swensen",
      attendees: [{ displayName: "Randy Swensen", email: null, status: "unknown" }]
    })]), people);

    expect(rendered.block).toContain("### Meet [[People/Randy Swensen|randy   swensen]]\n09:00 – 10:00");
  });

  it("keeps UTF-16 title coordinates correct around emoji and canonical accents", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Randy Swensen.md", basename: "Randy Swensen", frontmatter: {} },
      { path: "People/José.md", basename: "José", frontmatter: {} }
    ], []), true);
    const emoji = renderCalendarBlockWithSummary(payload([event({
      title: "🧑‍💻 Randy sync",
      attendees: [{ displayName: "Randy Swensen", email: null, status: "unknown" }]
    })]), people);
    const decomposedJose = "Jose\u0301";
    const accent = renderCalendarBlockWithSummary(payload([event({
      title: `Meet ${decomposedJose}`,
      attendees: [{ displayName: "José", email: null, status: "unknown" }]
    })]), people);

    expect(emoji.block).toContain("### 🧑‍💻 [[People/Randy Swensen|Randy]] sync\n09:00 – 10:00");
    expect(accent.block).toContain(`### Meet [[People/José|${decomposedJose}]]\n09:00 – 10:00`);
  });

  it("preserves the complete original grapheme when combining marks reorder", () => {
    const targetName = "A\u0323\u0301da";
    const titleName = "A\u0301\u0323da";
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Accent.md", basename: targetName, frontmatter: {} }
    ], []), true);
    const rendered = renderCalendarBlockWithSummary(payload([event({
      title: `Meet ${titleName}`,
      attendees: [{ displayName: targetName, email: null, status: "unknown" }]
    })]), people);

    expect(rendered.block).toContain(`### Meet [[People/Accent|${titleName}]]\n09:00 – 10:00`);
  });

  it("folds uppercase Greek final sigma consistently across attendee and title matching", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Greek.md", basename: "ΟΣ", frontmatter: {} }
    ], []), true);
    const rendered = renderCalendarBlockWithSummary(payload([event({
      title: "ΟΣ sync",
      attendees: [{ displayName: "ΟΣ", email: null, status: "unknown" }]
    })]), people);

    expect(rendered.block).toContain("### [[People/Greek|ΟΣ]] sync\n09:00 – 10:00");
  });

  it("treats supplementary-plane letters and combining marks as name characters at boundaries", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Randy Swensen.md", basename: "Randy Swensen", frontmatter: {} }
    ], []), true);
    const rendered = renderCalendarBlockWithSummary(payload([event({
      title: "𐐀Randy e\u0301Randy",
      attendees: [{ displayName: "Randy Swensen", email: null, status: "unknown" }]
    })]), people);

    expect(rendered.block).toContain("### 𐐀Randy e\u0301Randy\n09:00 – 10:00");
    expect(rendered.linkCount).toBe(0);
  });

  it("links multiple matched attendees at their non-overlapping title occurrences", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Randy Swensen.md", basename: "Randy Swensen", frontmatter: {} },
      { path: "People/Ryan Chen.md", basename: "Ryan Chen", frontmatter: {} }
    ], []), true);
    const rendered = renderCalendarBlockWithSummary(payload([event({
      title: "Randy and Ryan planning",
      attendees: [
        { displayName: "Randy Swensen", email: null, status: "unknown" },
        { displayName: "Ryan Chen", email: null, status: "unknown" }
      ]
    })]), people);

    expect(rendered.block).toContain("## [[People/Randy Swensen|Randy]] and [[People/Ryan Chen|Ryan]] planning\n09:00 – 10:00");
    expect(rendered.linkCount).toBe(2);
  });

  it("drops a shared first-name short form while retaining unambiguous full names", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Randy One.md", basename: "Randy One", frontmatter: {} },
      { path: "People/Randy Two.md", basename: "Randy Two", frontmatter: {} }
    ], []), true);
    const short = renderCalendarBlockWithSummary(payload([event({
      title: "Randy sync",
      attendees: [
        { displayName: "Randy One", email: null, status: "unknown" },
        { displayName: "Randy Two", email: null, status: "unknown" }
      ]
    })]), people);
    const full = renderCalendarBlockWithSummary(payload([event({
      title: "Randy One and Randy Two sync",
      attendees: [
        { displayName: "Randy One", email: null, status: "unknown" },
        { displayName: "Randy Two", email: null, status: "unknown" }
      ]
    })]), people);

    expect(short.block).toContain("### Randy sync\n09:00 – 10:00");
    expect(short.block).not.toContain("People/");
    expect(full.block).toContain("[[People/Randy One|Randy One]] and [[People/Randy Two|Randy Two]]");
  });

  it("does not derive short links from surnames, punctuation, or stopwords", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Randy, Swensen.md", basename: "Randy, Swensen", frontmatter: {} },
      { path: "People/The Team.md", basename: "The Team", frontmatter: {} }
    ], []), true);
    const surname = renderCalendarBlockWithSummary(payload([event({
      title: "Swensen planning",
      attendees: [{ displayName: "Randy, Swensen", email: null, status: "unknown" }]
    })]), people);
    const stopword = renderCalendarBlockWithSummary(payload([event({
      title: "The planning",
      attendees: [{ displayName: "The Team", email: null, status: "unknown" }]
    })]), people);

    expect(surname.block).toContain("### Swensen planning\n09:00 – 10:00");
    expect(stopword.block).toContain("### The planning\n09:00 – 10:00");
    expect(surname.block).not.toContain("People/");
    expect(stopword.block).not.toContain("People/");
  });

  it("keeps internal apostrophes and hyphens in short names but rejects numeric and Last, First fragments", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/O'Neil Smith.md", basename: "O'Neil Smith", frontmatter: {} },
      { path: "People/Mary-Jane Watson.md", basename: "Mary-Jane Watson", frontmatter: {} },
      { path: "People/123 Team.md", basename: "123 Team", frontmatter: {} },
      { path: "People/Swensen, Randy.md", basename: "Swensen, Randy", frontmatter: {} }
    ], []), true);
    const apostrophe = renderCalendarBlockWithSummary(payload([event({
      title: "O'Neil sync",
      attendees: [{ displayName: "O'Neil Smith", email: null, status: "unknown" }]
    })]), people);
    const hyphen = renderCalendarBlockWithSummary(payload([event({
      title: "Mary-Jane sync",
      attendees: [{ displayName: "Mary-Jane Watson", email: null, status: "unknown" }]
    })]), people);
    const numeric = renderCalendarBlockWithSummary(payload([event({
      title: "123 sync",
      attendees: [{ displayName: "123 Team", email: null, status: "unknown" }]
    })]), people);
    const lastFirst = renderCalendarBlockWithSummary(payload([event({
      title: "Swensen sync",
      attendees: [{ displayName: "Swensen, Randy", email: null, status: "unknown" }]
    })]), people);
    const lastFirstFull = renderCalendarBlockWithSummary(payload([event({
      title: "Swensen, Randy sync",
      attendees: [{ displayName: "Swensen, Randy", email: null, status: "unknown" }]
    })]), people);

    expect(apostrophe.block).toContain("[[People/O'Neil Smith|O'Neil]]");
    expect(hyphen.block).toContain("[[People/Mary-Jane Watson|Mary-Jane]]");
    expect(numeric.block).not.toContain("People/");
    expect(lastFirst.block).not.toContain("People/");
    expect(lastFirstFull.block).toContain("[[People/Swensen, Randy|Swensen, Randy]]");
  });

  it("does not append a person link when the matched attendee is absent from the title", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "People/Randy Swensen.md", basename: "Randy Swensen", frontmatter: {} }
    ], []), true);
    const rendered = renderCalendarBlockWithSummary(payload([event({
      title: "Project planning",
      attendees: [{ displayName: "Randy Swensen", email: null, status: "unknown" }]
    })]), people);

    expect(rendered.block).toContain("### Project planning\n09:00 – 10:00");
    expect(rendered.block).not.toContain("People/Randy");
    expect(rendered.linkCount).toBe(0);
  });

  it("leaves ambiguous and unmatched attendee names plain", () => {
    const ambiguousPeople = preparedPeople(buildPeopleIndex([
      { path: "One/Randy Swensen.md", basename: "Randy Swensen", frontmatter: {} },
      { path: "Two/Randy Swensen.md", basename: "Randy Swensen", frontmatter: {} }
    ], []), true);
    const ambiguous = renderCalendarBlockWithSummary(payload([event({
      title: "Randy - Ryan chat",
      attendees: [{ displayName: "Randy Swensen", email: null, status: "unknown" }]
    })]), ambiguousPeople);
    const unmatched = renderCalendarBlockWithSummary(payload([event({
      title: "Randy - Ryan chat",
      attendees: [{ displayName: "Unknown Person", email: null, status: "unknown" }]
    })]), buildPeopleIndex([], []));

    expect(ambiguous.block).toContain("### Randy - Ryan chat\n09:00 – 10:00");
    expect(unmatched.block).toContain("### Randy - Ryan chat\n09:00 – 10:00");
    expect(ambiguous.block).not.toContain("People/");
    expect(unmatched.block).not.toContain("People/");
  });

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
    expect(rendered).toContain("### Timed early\n8:00 AM–9:00 AM");
    expect(rendered).toContain("### Timed late\n11:00 AM–12:30 PM");
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

    expect(rendered).toContain("## Calendar");
    expect(rendered).not.toContain("<!-- calendar-daily-note-linker:start -->");
    expect(rendered).not.toContain("<!-- calendar-daily-note-linker:end -->");
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
    expect(invalid).toContain("### No link\n9:00 AM–10:00 AM");
    expect(invalid).not.toContain("[No link](");
  });

  it("uses a unique basename or alias as a no-attendee title fallback", () => {
    const index = preparedPeople(buildPeopleIndex([
      { path: "Projects/Project.md", basename: "Project", frontmatter: {} },
      { path: "People/Ada.md", basename: "Ada", frontmatter: { aliases: ["Ada Lovelace"] } }
    ], []));
    const titleFallback = renderCalendarBlock(payload([event({ title: "Project" })]), "## Calendar", index);
    const modernTitleOnly = renderCalendarBlockWithSummary(payload([event({ title: "Project" })]), index);
    const aliasFallback = renderCalendarBlockWithSummary(payload([event({ title: "Ada Lovelace planning" })]), index);
    expect(titleFallback).toContain("### [[Projects/Project.md|Project]]\n9:00 AM–10:00 AM");
    expect(modernTitleOnly.block).toContain("### [[Projects/Project.md|Project]]\n09:00 – 10:00");
    expect(aliasFallback.block).toContain("### [[People/Ada.md|Ada Lovelace]] planning");

    const attendeeWins = renderCalendarBlock(payload([event({
      title: "Ada Project",
      attendees: [{ displayName: "Ada Lovelace", email: null, status: "unknown" }]
    })]), "## Calendar", index);
    expect(attendeeWins).toContain("### [[People/Ada.md|Ada]] Project\n9:00 AM–10:00 AM");
    expect(attendeeWins).not.toContain("Projects/Project");
  });

  it("selects the longest specific title-only phrase", () => {
    const people = preparedPeople(buildPeopleIndex([
      { path: "Projects/Cloud.md", basename: "Cloud", frontmatter: {} },
      { path: "Projects/Cloud FinOps.md", basename: "Cloud FinOps", frontmatter: {} }
    ], []));
    const rendered = renderCalendarBlockWithSummary(payload([event({ title: "Cloud FinOps Weekly Meeting" })]), people);

    expect(rendered.block).toContain("### [[Projects/Cloud FinOps.md|Cloud FinOps]] Weekly Meeting");
    expect(rendered.block).not.toContain("Projects/Cloud.md");
    expect(rendered.linkCount).toBe(1);
  });

  it("rejects ambiguous longest phrases and fragments inside words", () => {
    const ambiguous = preparedPeople(buildPeopleIndex([
      { path: "One/Cloud FinOps.md", basename: "Cloud FinOps", frontmatter: {} },
      { path: "Two/Cloud FinOps.md", basename: "Cloud FinOps", frontmatter: {} }
    ], []));
    const ambiguousRendered = renderCalendarBlockWithSummary(payload([event({ title: "Cloud FinOps Weekly" })]), ambiguous);
    expect(ambiguousRendered.block).toContain("### Cloud FinOps Weekly\n09:00 – 10:00");
    expect(ambiguousRendered.linkCount).toBe(0);

    const fragments = preparedPeople(buildPeopleIndex([
      { path: "Projects/Cloud.md", basename: "Cloud", frontmatter: {} },
      { path: "Projects/FinOps.md", basename: "FinOps", frontmatter: {} }
    ], []));
    const fragmentRendered = renderCalendarBlockWithSummary(payload([event({ title: "CloudFinOps Weekly" })]), fragments);
    expect(fragmentRendered.block).toContain("### CloudFinOps Weekly\n09:00 – 10:00");
    expect(fragmentRendered.block).not.toContain("Projects/");
    expect(fragmentRendered.linkCount).toBe(0);
  });
});

describe("visible Calendar section insertion", () => {
  const block = "## Calendar\n### New event\n09:00 – 09:30";

  it("creates the section at the end of the unique # Notes region", () => {
    const note = [
      "---",
      "# Notes",
      "title: frontmatter",
      "...",
      "```markdown",
      "# Notes",
      "```",
      "    # Notes",
      "# Notes",
      "Manual note",
      "## Other",
      "Outside"
    ].join("\n");
    expect(parseStandaloneAtxHeadings(note).map((heading) => heading.text)).toEqual(["# Notes", "## Other"]);
    expect(insertCalendarSection(note, block)).toBe([
      "---",
      "# Notes",
      "title: frontmatter",
      "...",
      "```markdown",
      "# Notes",
      "```",
      "    # Notes",
      "# Notes",
      "Manual note",
      "## Other",
      "Outside",
      block
    ].join("\n"));
  });

  it("replaces the whole visible section body through the next # or ## heading", () => {
    const note = "# Notes\nIntro\n## Calendar\nold\n### Nested old\nmanual\n## Next\noutside\n# End\nend";
    expect(insertCalendarSection(note, block)).toBe("# Notes\nIntro\n## Calendar\n### New event\n09:00 – 09:30\n## Next\noutside\n# End\nend");
  });

  it("replaces a visible section through EOF without inventing a trailing newline", () => {
    const note = "# Notes\nIntro\n## Calendar\nold\n### Nested old\nmanual";
    const replaced = insertCalendarSection(note, block);
    expect(replaced).toBe("# Notes\nIntro\n## Calendar\n### New event\n09:00 – 09:30");
    expect(replaced.endsWith("\n")).toBe(false);
  });

  it("migrates a valid marker block to the safe end of Notes and removes both markers", () => {
    const old = "Before\n# Notes\n<!-- calendar-daily-note-linker:start -->\n## Calendar\n- Old\n<!-- calendar-daily-note-linker:end -->\nAfter\n# Other\nOutside";
    const migrated = insertCalendarSection(old, block);
    expect(migrated).toBe("Before\n# Notes\nAfter\n## Calendar\n### New event\n09:00 – 09:30\n# Other\nOutside");
    expect(migrated).not.toContain("calendar-daily-note-linker:start");
    expect(migrated).not.toContain("calendar-daily-note-linker:end");
  });

  it("migrates a marker from an old cursor or custom-heading location outside Notes", () => {
    const old = "# Custom destination\n### Cursor context\n<!-- calendar-daily-note-linker:start -->\n## Old event\n10:00\n<!-- calendar-daily-note-linker:end -->\nCustom prose\n# Notes\nManual prose\n# Next\nOutside";
    const migrated = insertCalendarSection(old, block);
    expect(migrated).toBe("# Custom destination\n### Cursor context\nCustom prose\n# Notes\nManual prose\n## Calendar\n### New event\n09:00 – 09:30\n# Next\nOutside");
    expect(insertCalendarSection(migrated, block)).toBe(migrated);
  });

  it("reuses the one fixed Calendar section after removing an outside legacy marker", () => {
    const old = "# Custom destination\n<!-- calendar-daily-note-linker:start -->\n## Old event\n10:00\n<!-- calendar-daily-note-linker:end -->\n# Notes\nManual prose\n## Calendar\nOld visible events\n# Next\nOutside";
    const migrated = insertCalendarSection(old, block);
    expect(migrated).toBe("# Custom destination\n# Notes\nManual prose\n## Calendar\n### New event\n09:00 – 09:30\n# Next\nOutside");
    expect(insertCalendarSection(migrated, block)).toBe(migrated);
  });

  it("removes an empty Calendar wrapper around a legacy marker before migrating", () => {
    const old = "# Custom destination\n## Calendar\n  \n<!-- calendar-daily-note-linker:start -->\n## Old event\n10:00\n<!-- calendar-daily-note-linker:end -->\n\t\n# Notes\nManual prose\n# Next\nOutside";
    const migrated = insertCalendarSection(old, block);
    expect(migrated).toBe("# Custom destination\n# Notes\nManual prose\n## Calendar\n### New event\n09:00 – 09:30\n# Next\nOutside");
    expect(insertCalendarSection(migrated, block)).toBe(migrated);
  });

  it("is idempotent and preserves CRLF newline style", () => {
    const note = "Before\r\n# Notes\r\nManual\r\n## Calendar\r\nOld\r\n## Next\r\nOutside\r\n";
    const first = insertCalendarSection(note, block);
    const second = insertCalendarSection(first, block.replace("New event", "Updated event"));
    expect(second).toBe("Before\r\n# Notes\r\nManual\r\n## Calendar\r\n### Updated event\r\n09:00 – 09:30\r\n## Next\r\nOutside\r\n");
    expect(second).not.toContain("\n\n");
    expect(second).not.toContain("calendar-daily-note-linker:");
  });

  it("keeps unheaded manual prose outside a newly created section byte-identical on the next import", () => {
    const note = "# Notes\nManual prose that has no heading.\nMore manual prose.\n# Next\nOutside";
    const first = insertCalendarSection(note, block);
    expect(first).toBe("# Notes\nManual prose that has no heading.\nMore manual prose.\n## Calendar\n### New event\n09:00 – 09:30\n# Next\nOutside");
    expect(insertCalendarSection(first, block)).toBe(first);
  });

  it("keeps unheaded manual prose byte-identical while migrating a marker block", () => {
    const note = "# Notes\n<!-- calendar-daily-note-linker:start -->\n## Calendar\n## Old event\n10:00\n<!-- calendar-daily-note-linker:end -->\nManual prose that has no heading.\nMore manual prose.\n# Next\nOutside";
    const first = insertCalendarSection(note, block);
    expect(first).toBe("# Notes\nManual prose that has no heading.\nMore manual prose.\n## Calendar\n### New event\n09:00 – 09:30\n# Next\nOutside");
    expect(insertCalendarSection(first, block)).toBe(first);
  });

  it("migrates a marker block with no internal section heading", () => {
    const note = "# Notes\nIntro\n<!-- calendar-daily-note-linker:start -->\nOld event\n10:00\n<!-- calendar-daily-note-linker:end -->\nOutro\n# Next";
    expect(insertCalendarSection(note, block)).toBe("# Notes\nIntro\nOutro\n## Calendar\n### New event\n09:00 – 09:30\n# Next");
  });

  it("ignores multiple exact Calendar headings inside a valid marker block", () => {
    const note = "# Notes\n<!-- calendar-daily-note-linker:start -->\n## Calendar\nOld one\n## Calendar\nOld two\n<!-- calendar-daily-note-linker:end -->\nManual\n# Next";
    expect(insertCalendarSection(note, block)).toBe("# Notes\nManual\n## Calendar\n### New event\n09:00 – 09:30\n# Next");
  });

  it("preserves a no-trailing-newline note while migrating at EOF", () => {
    const note = "# Notes\n<!-- calendar-daily-note-linker:start -->\nOld\n<!-- calendar-daily-note-linker:end -->";
    const migrated = insertCalendarSection(note, block);
    expect(migrated).toBe("# Notes\n## Calendar\n### New event\n09:00 – 09:30");
    expect(migrated.endsWith("\n")).toBe(false);
  });

  it("ignores fake headings in tilde fences when finding Notes and Calendar", () => {
    const note = "# Notes\n~~~markdown\n# Notes\n## Calendar\n~~~\nManual\n# Next\nOutside";
    expect(insertCalendarSection(note, block)).toBe("# Notes\n~~~markdown\n# Notes\n## Calendar\n~~~\nManual\n## Calendar\n### New event\n09:00 – 09:30\n# Next\nOutside");
  });

  it("rejects missing or duplicate Notes, duplicate Calendar, malformed markers, and markers outside Notes without mutation", () => {
    const cases = [
      "Before\nOther",
      "# Notes\nOne\n# Notes\nTwo",
      "# Notes\n## Calendar\nOne\n## Calendar\nTwo",
      "# Notes\n<!-- calendar-daily-note-linker:start -->\nold",
      "# Notes\n<!-- calendar-daily-note-linker:end -->\nold",
      "# Notes\n<!-- calendar-daily-note-linker:end -->\nold\n<!-- calendar-daily-note-linker:start -->",
      "# Notes\n<!-- calendar-daily-note-linker:start -->\nold\n<!-- calendar-daily-note-linker:start -->\nold\n<!-- calendar-daily-note-linker:end -->",
      "# Notes\ntext <!-- calendar-daily-note-linker:start -->\nold\n<!-- calendar-daily-note-linker:end -->",
      "# Notes\n<!-- calendar-daily-note-linker:start -->\nold\n<!-- calendar-daily-note-linker:end -->\n# Other\n## Calendar\nOutside"
    ];
    for (const note of cases) {
      expect(() => insertCalendarSection(note, block)).toThrow();
      expect(note).not.toContain("New event");
    }
  });

  it("keeps cursor insertion disabled and retains safe legacy replacement APIs", () => {
    expect(() => relocateCalendarBlockAtCursor("# Notes", block, 0)).toThrow(/no longer supported/);
    const old = "# Notes\n<!-- calendar-daily-note-linker:start -->\n## Calendar\nOld\n<!-- calendar-daily-note-linker:end -->\nAfter";
    expect(replaceCalendarBlock(old, block)).toBe("# Notes\nAfter\n## Calendar\n### New event\n09:00 – 09:30");
  });
});

describe("People links and settings", () => {
  it("preserves special file paths and display aliases in prepared links", () => {
    const index = buildPeopleIndex([{
      path: "People/Team [A]/Ada | Lovelace.md",
      basename: "Ada | Lovelace",
      file: {} as never,
      frontmatter: { aliases: ["The Enchantress"] }
    }], []);
    const linked = preparedPeople(index);
    const rendered = renderCalendarBlock(payload([event({
      title: "Meet Ada",
      attendees: [{ displayName: "The Enchantress", email: null, status: "unknown" }]
    })]), "## Calendar", linked);
    const displayRendered = renderCalendarBlock(payload([event({
      title: "Meet Ada | Lovelace",
      attendees: [{ displayName: "Ada | Lovelace", email: null, status: "unknown" }]
    })]), "## Calendar", linked);

    expect(rendered).toContain("[[People/Team [A\\]/Ada \\| Lovelace.md|Ada]]");
    expect(displayRendered).toContain("[[People/Team [A\\]/Ada \\| Lovelace.md|Ada \\| Lovelace]]");
  });

  it("prepares explicit Obsidian link destinations without parsing generated Markdown", () => {
    const index = buildPeopleIndex([
      { path: "People/Ada.md", basename: "Ada", frontmatter: {} }
    ], []);
    const prepared = preparePeopleLinks(index, () => ({ linkText: "People/Ada" }));
    const rendered = renderCalendarBlockWithSummary(payload([event({
      title: "Meet Ada",
      attendees: [{ displayName: "Ada", email: null, status: "unknown" }]
    })]), prepared);

    expect(rendered.block).toContain("### Meet [[People/Ada|Ada]]");
    expect(() => preparePeopleLinks(index, () => ({ linkText: "People/Ada\n" }))).toThrow(/unsafe/);
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

  it("keeps the visible section headings fixed", () => {
    expect(tryNormalizeSectionHeading("## Calendar")).toBe("## Calendar");
    expect(normalizeSectionHeading("anything")).toBe("## Calendar");
    expect(tryNormalizeSectionHeading("### Daily Notes")).toBeUndefined();
    expect(tryNormalizeInsertionHeading("# Notes")).toBe("# Notes");
    expect(tryNormalizeInsertionHeading("# Other")).toBeUndefined();
  });

  it("migrates old insertion settings and level 2 to the fixed visible section", () => {
    const migrated = parsePersistedPluginSettings({
      sectionHeading: "### Legacy destination",
      peopleFolder: "People",
      eventHeadingLevel: "2",
      timeFormat: "12-hour",
      insertionMode: "cursor"
    });
    expect(migrated.insertionHeading).toBe("# Notes");
    expect(migrated.insertionMode).toBe("heading");
    expect(migrated.eventHeadingLevel).toBe(3);
    expect(migrated.timeFormat).toBe("12-hour");
    expect(migrated).not.toHaveProperty("peopleFolder");

    const invalidNewHeading = parsePersistedPluginSettings({
      sectionHeading: "### Old",
      insertionHeading: "not a heading"
    });
    expect(invalidNewHeading.insertionHeading).toBe("# Notes");
  });

  it("defaults to all calendars and accepts a distinct selected-calendar list", () => {
    expect(parsePersistedPluginSettings({}).selectedCalendarIds).toEqual({ ids: null, malformed: false });
    expect(parsePersistedPluginSettings({ selectedCalendarIds: ["one", "one", "two"] }).selectedCalendarIds)
      .toEqual({ ids: ["one", "two"], malformed: false });
    expect(tryNormalizeSelectedCalendarIds(["valid", "bad\nvalue"])).toBeUndefined();
    expect(parsePersistedPluginSettings({ selectedCalendarIds: "not-an-array" }).selectedCalendarIds)
      .toEqual({ ids: [], malformed: true, rawInput: "not-an-array" });
  });

  it("normalizes only visible event headings from 3 through 6", () => {
    expect(tryNormalizeEventHeadingLevel(2)).toBe(3);
    expect(tryNormalizeEventHeadingLevel("2")).toBe(3);
    expect(tryNormalizeEventHeadingLevel(3)).toBe(3);
    expect(tryNormalizeEventHeadingLevel(6)).toBe(6);
    expect(tryNormalizeEventHeadingLevel(7)).toBeUndefined();
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

  it("passes explicitly selected Calendar identifiers to EventKit", async () => {
    let args: string[] = [];
    await fetchCalendarPayload("2025-01-15", ["calendar-a", "calendar-b"], async (_command, commandArgs) => {
      args = commandArgs;
      return { stdout: JSON.stringify(payload([])), stderr: "" };
    });
    expect(args[5]).toBe('["calendar-a","calendar-b"]');
  });

  it("lists available Calendar identifiers and display names", async () => {
    const calendars = await fetchAvailableCalendars(async (_command, args) => {
      expect(args[4]).toBe("--list-calendars");
      return { stdout: JSON.stringify([{ id: "calendar-a", title: "Work", source: "iCloud" }]), stderr: "" };
    });
    expect(calendars).toEqual([{ id: "calendar-a", title: "Work", source: "iCloud" }]);
  });

  it("rejects invalid bridge date arguments before spawning", async () => {
    await expect(fetchCalendarPayload("2025-02-30", async () => {
      throw new Error("runner must not be called");
    })).rejects.toThrow(/valid calendar date/);
  });

  it("rejects an invalid target date and unknown warnings", () => {
    expect(() => validateCalendarPayload({ ...payload([]), targetDate: "2025-02-30" })).toThrow(/targetDate/);
    expect(() => validateCalendarPayload({ ...payload([]), warnings: ["Calendar enumeration failed"] })).toThrow(/warnings/);
    expect(validateCalendarPayload({
      ...payload([]),
      warnings: ["EventKit calendar data is unavailable on this macOS/source."]
    }).warnings).toEqual(["EventKit calendar data is unavailable on this macOS/source."]);
  });

  it("uses the native EventKit predicate without Calendar.app scripting", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/calendar-events.js"), "utf8");
    expect(source).toContain('ObjC.import("EventKit")');
    expect(source).toContain("$.EKEventStore.alloc.initWithAccessToEntityTypes($.EKEntityMaskEvent)");
    expect(source).toContain("predicateForEventsWithStartDateEndDateCalendars(start,end,calendars)");
    expect(source).toContain("EventKit predicate creation failed for the selected calendars.");
    expect(source).toContain("calendars !== null");
    expect(source).toContain("calendarsForEntityType($.EKEntityTypeEvent)");
    expect(source).toContain("--list-calendars");
    expect(source).toContain("calendarIdentifier");
    expect(source).toContain("authorizationStatusForEntityType");
    expect(source).toContain("var EVENTKIT_AUTH_FULL_ACCESS = 3;");
    expect(source).toContain("var EVENTKIT_AUTH_WRITE_ONLY = 4;");
    expect(source).toContain("status === EVENTKIT_AUTH_WRITE_ONLY");
    expect(source).toContain("status === EVENTKIT_AUTH_NOT_DETERMINED || status === EVENTKIT_AUTH_WRITE_ONLY");
    expect(source).toContain("if (status === EVENTKIT_AUTH_FULL_ACCESS && granted.value) return;");
    expect(source).toContain("if (status === EVENTKIT_AUTH_WRITE_ONLY) throw permissionError(EVENTKIT_PERMISSION_CODES.writeOnly);");
    expect(source).toContain('writeOnly: "EVENTKIT_PERMISSION_WRITE_ONLY"');
    expect(source).toContain("requestFullAccessToEventsWithCompletion");
    expect(source).toContain("requestAccessToEntityTypeCompletion");
    expect(source).toContain('$block("void, bool, id"');
    expect(source).toContain('readOptionalProperty(event, "URL")');
    expect(source).toContain('readOptionalProperty(result.value, "title")');
    expect(source).toContain('readOptionalProperty(participant, "name")');
    expect(source).toContain('readOptionalProperty(participant, "URL")');
    expect(source).toContain('"unknown", "pending", "accepted", "declined", "tentative", "delegated", "completed", "in-process"');
    expect(source).not.toContain('readOptionalProperty(event, "location")');
    expect(source).not.toContain('readOptionalProperty(event, "notes")');
    expect(source).not.toContain('Application("Calendar")');
    expect(source).not.toContain("events.whose");
    expect(source).not.toContain("_lessThan");
    expect(source).not.toContain("_greaterThan");
  });

  it("validates the EventKit payload source and optional-data warnings", () => {
    const valid = validateCalendarPayload({
      ...payload([event({
        id: "event-id",
        attendees: [{ displayName: null, email: "person@example.com", status: "unknown" }]
      })]),
      source: "EventKit",
      warnings: [
        "EventKit attendee email data is unavailable on this macOS/source.",
        "Some EventKit attendee data is unavailable on this macOS/source."
      ]
    });
    expect(valid.source).toBe("EventKit");
    expect(valid.events[0].id).toBe("event-id");
    expect(valid.events[0].attendees[0].status).toBe("unknown");
    expect(() => validateCalendarPayload({
      ...payload([event({ attendees: [{ displayName: null, email: null, status: null as never }] })]),
      source: "EventKit"
    })).toThrow(/status/);
    expect(() => validateCalendarPayload({
      ...payload([]),
      source: "EventKit",
      warnings: ["Calendar enumeration failed"]
    })).toThrow(/warnings/);
  });

  it("only treats stable EventKit permission codes as permission failures", async () => {
    const permissionError = Object.assign(new Error("osascript failed"), {
      stderr: "Error: EVENTKIT_PERMISSION_DENIED: access denied\n"
    });
    await expect(fetchCalendarPayload("2025-01-15", async () => {
      throw permissionError;
    })).rejects.toMatchObject({
      name: "CalendarBridgeError",
      isPermissionFailure: true,
      message: expect.stringContaining("System Settings → Privacy & Security → Calendars")
    });

    const writeOnlyError = Object.assign(new Error("osascript failed"), {
      stderr: "Error: EVENTKIT_PERMISSION_WRITE_ONLY: access is write-only\n"
    });
    await expect(fetchCalendarPayload("2025-01-15", async () => {
      throw writeOnlyError;
    })).rejects.toMatchObject({
      name: "CalendarBridgeError",
      isPermissionFailure: true,
      message: expect.stringContaining("EVENTKIT_PERMISSION_WRITE_ONLY")
    });

    const nativeError = Object.assign(new Error("osascript failed"), {
      stderr: "Error: EventKit event query failed\n"
    });
    await expect(fetchCalendarPayload("2025-01-15", async () => {
      throw nativeError;
    })).rejects.toMatchObject({
      name: "CalendarBridgeError",
      isPermissionFailure: false,
      message: "EventKit bridge failed: Error: EventKit event query failed"
    });
    await expect(fetchCalendarPayload("2025-01-15", async () => {
      throw new CalendarBridgeError("EventKit bridge failed: local test");
    })).rejects.not.toThrow(/Calendars/);
  });
});

describe("Daily Notes provider resolution", () => {
  const parseMoment = (stem: string, format: string, strict = true) => moment(stem, format, strict);
  const createMoment = (isoDate: string) => moment(isoDate, "YYYY-MM-DD", true);
  const coreOptions = { folder: "Calendar/Daily", format: "YYYY/MM/YYYY-MM-DD", template: "" };
  const activeCoreFile = { path: "Calendar/Daily/2026/08/2026-08-06.md", basename: "2026-08-06", extension: "md" };

  it("selects the exact installed core configuration even when Periodic daily settings exist", () => {
    const app = {
      internalPlugins: { plugins: { "daily-notes": { enabled: true, instance: { options: coreOptions } } } },
      plugins: { getPlugin: () => ({ settings: { daily: { enabled: true, folder: "Other", format: "YYYY-MM-DD", template: "" } } }) }
    };
    const candidates = getDailyNoteProviderCandidates(app);
    const selected = resolveActiveDailyNoteProvider(activeCoreFile, candidates, parseMoment, createMoment);
    expect(selected.kind).toBe("core");
    expect(selected.targetDate).toBe("2026-08-06");
  });

  it("selects a Periodic-only active Daily Note", () => {
    const file = { path: "Periodic/2026/08/2026-08-06.md", basename: "2026-08-06", extension: "md" };
    const app = {
      internalPlugins: { plugins: { "daily-notes": { enabled: false, instance: { options: coreOptions } } } },
      plugins: { getPlugin: () => ({ settings: { daily: { enabled: true, folder: "Periodic", format: "YYYY/MM/YYYY-MM-DD", template: "" } } }) }
    };
    const selected = resolveActiveDailyNoteProvider(file, getDailyNoteProviderCandidates(app), parseMoment, createMoment);
    expect(selected.kind).toBe("periodic");
    expect(selected.targetDate).toBe("2026-08-06");
  });

  it("defaults empty provider formats safely for Core and Periodic Notes", () => {
    const coreFile = { path: "Core/2026-08-06.md", basename: "2026-08-06", extension: "md" };
    const coreApp = {
      internalPlugins: { plugins: { "daily-notes": { enabled: true, instance: { options: { folder: "Core", format: " ", template: "" } } } } },
      plugins: { getPlugin: () => undefined }
    };
    const periodicFile = { path: "Periodic/2026-08-06.md", basename: "2026-08-06", extension: "md" };
    const periodicApp = {
      internalPlugins: { plugins: {} },
      plugins: { getPlugin: () => ({ settings: { daily: { enabled: true, folder: "Periodic", format: "", template: "" } } }) }
    };
    expect(resolveActiveDailyNoteProvider(coreFile, getDailyNoteProviderCandidates(coreApp), parseMoment, createMoment).kind).toBe("core");
    expect(resolveActiveDailyNoteProvider(periodicFile, getDailyNoteProviderCandidates(periodicApp), parseMoment, createMoment).kind).toBe("periodic");
  });

  it("reports provider-specific compatibility errors for malformed shapes", () => {
    const coreInspection = inspectDailyNoteProviders({
      internalPlugins: { plugins: { "daily-notes": { enabled: true } } },
      plugins: { getPlugin: () => undefined }
    });
    expect(coreInspection.errors.some((error) => error.kind === "core" && /Core Daily Notes/.test(error.message))).toBe(true);

    const periodicInspection = inspectDailyNoteProviders({
      internalPlugins: { plugins: {} },
      plugins: { getPlugin: () => ({ settings: { daily: { enabled: true, folder: [] } } }) }
    });
    expect(periodicInspection.errors.some((error) => error.kind === "periodic" && /Periodic Notes/.test(error.message))).toBe(true);
  });

  it("rejects an active file that matches no configured provider", () => {
    const app = { internalPlugins: { plugins: {} }, plugins: { getPlugin: () => undefined } };
    expect(() => resolveActiveDailyNoteProvider(activeCoreFile, getDailyNoteProviderCandidates(app), parseMoment, createMoment)).toThrow(/does not match/);
  });

  it("rejects a provider or configuration change before writing", () => {
    const app = {
      internalPlugins: { plugins: { "daily-notes": { enabled: true, instance: { options: coreOptions } } } },
      plugins: { getPlugin: () => undefined }
    };
    const initial = resolveActiveDailyNoteProvider(activeCoreFile, getDailyNoteProviderCandidates(app), parseMoment, createMoment);
    const changed = { ...initial, settings: { ...initial.settings, format: "YYYY-MM-DD" } };
    expect(() => assertSameDailyNoteProvider(initial, changed)).toThrow(/provider or configuration/);
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
    expect(() => resolveActiveDailyDate({ ...file, extension: "canvas" }, settings, parseMoment, undefined, createMoment)).toThrow(/existing configured/);
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
      .toBe("Imported 2 Calendar events into 2025-01-14. No uniquely matched attendee names or title phrases appeared in event titles.");
    expect(summarizeImportOutcome("2025-01-14", "2025-01-14", 2, 3))
      .toBe("Imported 2 Calendar events into 2025-01-14 and added 3 vault links for matched attendee names or title phrases.");
    expect(summarizeImportOutcome("2025-01-14", "2025-01-14", 1, 1))
      .toBe("Imported 1 Calendar event into 2025-01-14 and added 1 vault link for matched attendee names or title phrases.");
  });

  it("describes the configured destination, formatting, links, and relocation", () => {
    expect(summarizeImportOutcome("2025-01-14", "2025-01-14", 1, 1, {
      insertionMode: "heading",
      insertionHeading: "# Notes",
      eventHeadingLevel: 3,
      timeFormat: "24-hour",
      linkMatchingVaultNotes: true,
      linkEventTitles: true
    })).toContain("under # Notes; Heading 3, 24-hour, vault-note links on (attendee/title phrases), Calendar URL links on (separate when needed); visible Calendar section updated");
  });

  it("rejects active-file identity, path, date, and configuration changes", () => {
    const currentSettings = { folder: "Journal/Daily", format: "YYYY-MM-DD", template: "" };
    assertActiveDailyNoteUnchanged(file, file, currentSettings, currentSettings, "2025-01-14", "2025-01-14");
    expect(() => assertActiveDailyNoteUnchanged(file, { ...file }, currentSettings, currentSettings, "2025-01-14", "2025-01-14")).toThrow(/changed/);
    expect(() => assertActiveDailyNoteUnchanged(file, file, currentSettings, { ...currentSettings, format: "YYYY/MM/DD" }, "2025-01-14", "2025-01-14")).toThrow(/configuration/);
    expect(() => assertActiveDailyNoteUnchanged(file, file, currentSettings, currentSettings, "2025-01-14", "2025-01-15")).toThrow(/configuration/);
  });
});
