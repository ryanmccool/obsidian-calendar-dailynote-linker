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

The command updates only the open file's managed section:

```markdown
<!-- calendar-daily-note-linker:start -->
<!-- calendar-daily-note-linker:end -->
```

All-day events appear first, followed by timed events ordered by start time. Timed events use the Calendar bridge's local timezone. An empty block uses the active note's target date rather than “today”. Calendar notes and locations are not inserted.

## Vault matching and settings

The plugin searches all Markdown notes in the vault by default. **Vault folders to exclude** accepts optional vault-relative folders, one per line; exclusions include subfolders and blank input searches all Markdown notes. The native textarea placeholder is:

```text
Archive
Templates
Private/People
```

Paths normalize only separators, preserve `~` and leading/trailing spaces in legitimate vault segments, and reject absolute paths, empty segments, `.` and `..`. Folder boundaries are exact, so `Private` does not exclude `Privateer`. Older `peopleFolder` settings are ignored during migration. A malformed saved exclusion disables matching and must be corrected in settings; it never silently falls back to a whole-vault search.

Attendees match by normalized email first, then normalized display name. A key must belong to exactly one Markdown note through its basename, `aliases`, `email`, or `emails` frontmatter. If no attendee produces a unique link, the event title is tried against a unique basename or alias. Ambiguous attendee and title matches never link. Links are generated with Obsidian's file manager and can target notes anywhere in the non-excluded vault.

The settings page also provides **Section heading**, which saves when focus leaves the field, and brief guidance to open an existing configured Daily Note before running the command.

## Feedback and permissions

One updatable Notice reports the stages: checking the active note, reading Calendar for its date, matching vault notes, and writing the note. Final feedback is explicit: no events reports that the active note was updated; events without unique links report that no attendees or event titles uniquely matched; and linked events report grammatically correct event and vault-link counts.

The plugin requires macOS desktop and Calendar access. On first run, EventKit requests Calendar access; allow it in **System Settings → Privacy & Security → Calendars** if macOS does not show the prompt. The bridge waits for that request only with a bounded timeout and reports denied, restricted, unavailable, or timed-out permission failures. No Apple Event bridge permission is required.

The bridge uses `/usr/bin/osascript -l JavaScript` with native EventKit APIs; it does not enumerate or query Calendar.app. EventKit may not expose attendee names, participant email URLs, calendars, or event links for every source or macOS version; those optional limitations become warnings. Participant statuses are normalized to stable values such as `accepted`, `declined`, `tentative`, and `unknown`. EventKit location and notes are never read or emitted. Permission failures identify **System Settings → Privacy & Security → Calendars**; other bridge failures remain native EventKit errors. Required event-property failures abort before the active note is changed. A single private provider compatibility adapter safely validates the enabled Core Daily Notes and Periodic Notes settings shapes, defaults missing formats to `YYYY-MM-DD`, and reports provider-specific compatibility errors. The plugin selects the unique provider matching the active note; ambiguous provider/date matches abort.
