# Calendar Daily Note Linker

Calendar Daily Note Linker is a macOS desktop-only Obsidian plugin. The command **Import Calendar events into active Daily Note** imports events into the currently open, existing configured Daily Note.

## BRAT installation and release files

1. Build a versioned release with `main.js` and `manifest.json` as **loose, version-matched GitHub release assets**. The manifest and release/tag versions must match.
2. In Obsidian, install **BRAT** and add this repository URL as a beta plugin. BRAT should download those loose release assets; do not configure BRAT to install a zip or the source tree.
3. Enable **Calendar Daily Note Linker** and configure either core **Daily Notes** or Periodic Notes daily settings.

The JXA source remains under `scripts/calendar-events.js` for maintainability, but it is compiled into `main.js` and is not required at runtime. A zip containing `main.js` and `manifest.json` is for manual Obsidian installation only, not BRAT delivery.

For development:

```sh
npm install
npm test
npm run build
```

## Active Daily Notes and historical dates

Open an existing Markdown note that matches the configured core Daily Notes or Periodic Notes daily settings, then run the command. The plugin derives the date from that note's full path and configured format, so an active note for yesterday or another historical date imports that date's Calendar events. It never creates, opens, resolves, or switches to another Daily Note. Notes outside configured folders, unsupported formats, ambiguous formats, and non-Daily Notes are rejected.

The command updates only the open file's one managed block. The block is always
relocated to the configured destination rather than duplicated:

```markdown
<!-- calendar-daily-note-linker:start -->
<!-- calendar-daily-note-linker:end -->
```

By default, events look like this, with all-day events using `All day` on the
second line:

```markdown
## Mike - Ryan catchup
09:00 – 09:30
```

All-day events appear first, followed by timed events ordered by start time.
Timed events use the Calendar bridge's local timezone. An empty block uses the
active note's target date rather than “today”. Calendar notes and locations are
not inserted.

## Vault matching and settings

The plugin searches all Markdown notes in the vault by default. **Vault folders to exclude** accepts optional vault-relative folders, one per line; exclusions include subfolders and blank input searches all Markdown notes. The native textarea placeholder is:

```text
Archive
Templates
Private/People
```

Paths normalize only separators, preserve `~` and leading/trailing spaces in legitimate vault segments, and reject absolute paths, empty segments, `.` and `..`. Folder boundaries are exact, so `Private` does not exclude `Privateer`. Older `peopleFolder` settings are ignored during migration. When matching is enabled, a malformed saved exclusion disables matching and must be corrected in settings; it never silently falls back to a whole-vault search. When matching is disabled, exclusions are not read and no vault index or metadata is accessed.

Attendees match by normalized email first, then normalized display name. A key must belong to exactly one Markdown note through its basename, `aliases`, `email`, or `emails` frontmatter. If no attendee produces a unique link, the event title is tried against a unique basename or alias. Ambiguous attendee and title matches never link. Links are generated with Obsidian's file manager and can target notes anywhere in the non-excluded vault.

## Insertion and formatting settings

The **Insertion** section provides two destinations:

- **Below a heading** (default): configure an exact standalone Markdown
  **Insertion heading**, default `# Notes`. The managed block is placed
  immediately below the one matching heading. Only real standalone ATX
  headings are considered; YAML frontmatter, fenced code, and indented code
  are ignored. Missing or duplicate headings abort safely without changing the
  note.
- **At the cursor**: requires the active Markdown editor for the active Daily
  Note. The block is inserted at the current cursor, including when the note
  has unsaved edits.

The **Formatting** section controls event heading levels (default Heading 2),
24-hour times (default), matching vault-note links, and optional Calendar event
title links. The event title and generated matching links share the heading
line. The compact linking toggles are on by default. Settings save on change;
the insertion heading saves on blur, trims only incidental outer whitespace,
preserves internal whitespace, and accepts levels `#` through `######`.
The old `sectionHeading` setting described heading content inside the old
managed block, so it is not used as a destination. When no new insertion
heading exists, migration uses the external default `# Notes`; an old block is
relocated there only when that real heading exists. Old People settings are
ignored.

Both destinations own exactly one `calendar-daily-note-linker:start/end`
marker block. Every import rewrites and relocates that block while preserving
unrelated note content. Malformed, incomplete, or duplicated markers are
rejected rather than repaired.

The settings page also retains **Vault folders to exclude** and brief guidance
to open an existing configured Daily Note before running the command.

## Feedback and permissions

One updatable Notice reports the stages: checking the active note, reading Calendar for its date, matching vault notes, and writing the note. Final feedback names the configured destination (below the heading or at the cursor), current heading/time/link settings, and managed-block relocation. No events and matching-link counts are reported explicitly.

The plugin requires macOS desktop and Calendar access. On first run, EventKit requests Calendar access; allow it in **System Settings → Privacy & Security → Calendars** if macOS does not show the prompt. The bridge waits for that request only with a bounded timeout and reports denied, restricted, unavailable, or timed-out permission failures. No Apple Event bridge permission is required.

The bridge uses `/usr/bin/osascript -l JavaScript` with native EventKit APIs; it does not enumerate or query Calendar.app. EventKit may not expose attendee names, participant email URLs, calendars, or event links for every source or macOS version; those optional limitations become warnings. Participant statuses are normalized to stable values such as `accepted`, `declined`, `tentative`, and `unknown`. EventKit location and notes are never read or emitted. Permission failures identify **System Settings → Privacy & Security → Calendars**; other bridge failures remain native EventKit errors. Required event-property failures abort before the active note is changed. A single private provider compatibility adapter safely validates the enabled Core Daily Notes and Periodic Notes settings shapes, defaults missing formats to `YYYY-MM-DD`, and reports provider-specific compatibility errors. The plugin selects the unique provider matching the active note; ambiguous provider/date matches abort.
