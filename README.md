# Calendar Daily Note Linker

Calendar Daily Note Linker is a macOS desktop-only Obsidian plugin. Its command, **Populate today's Daily Note with Calendar events**, reads Calendar.app and replaces only the plugin-managed section in today's core Daily Note.

## BRAT installation and release files

1. Build a versioned release with `main.js` and `manifest.json` as **loose, version-matched GitHub release assets**. The `manifest.json` version and release/tag version must match.
2. In Obsidian, install **BRAT** and add this repository's URL as a beta plugin. BRAT should download those two loose release assets from the GitHub release; do not configure BRAT to install a zip or the source tree.
3. Enable **Calendar Daily Note Linker** and the core **Daily Notes** plugin.

The JXA source remains under `scripts/calendar-events.js` for maintainability, but it is compiled into `main.js` and is not required at runtime. A zip containing `main.js` and `manifest.json` is supported for manual Obsidian installation only; it is not the BRAT delivery mechanism.

For development:

```sh
npm install
npm test
npm run build
```

`npm run build` type-checks the strict TypeScript source, injects the fixed JXA source from `scripts/calendar-events.js` as a bundled string, and writes the plugin to root `main.js`. Runtime invokes `/usr/bin/osascript -l JavaScript -e <bundled-source>`; it does not resolve a script path from `manifest.dir` or depend on a loose script file.

## Permissions and macOS limitation

This plugin requires macOS desktop and Calendar.app. The first command run may cause macOS to ask whether Obsidian may control Calendar. Allow it in **System Settings > Privacy & Security > Automation**. Calendar access can also require Calendar permissions in **Privacy & Security**. If access is denied, the plugin reports the failure and does not create or modify a Daily Note.

The bridge uses Apple Calendar.app scripting through `/usr/bin/osascript -l JavaScript`. JXA and Calendar.app do not expose every field consistently: attendee display names, email addresses, and participation statuses can be unavailable depending on the calendar source and macOS version. Such limitations become attendee warnings; events still render when possible. Calendar enumeration failures terminate the command before any Daily Note work. Calendar notes and locations are deliberately not inserted into notes.

This release requires the core internal **Daily Notes** plugin. It rejects Periodic Notes' daily mode because the daily-notes interface otherwise follows that setting instead of the core plugin.

## People matching

The default People folder is `People`. The plugin recursively indexes only Markdown notes below that vault-relative folder. It indexes each note's filename/base name, `aliases` frontmatter, and `email` or `emails` frontmatter values (a string or array).

Attendees match by normalized email first, then normalized display name. Whitespace and case are normalized, but matching is not fuzzy. A key must belong to exactly one note; ambiguous keys never produce a link. Multiple unique attendees are de-duplicated and linked using their vault-relative paths, such as `[[People/Ada Lovelace|Ada Lovelace]]`. Event titles are never used as a fallback.

The settings tab provides **People folder** and **Section heading**. People-folder paths use vault-relative directory separators without collapsing meaningful spaces; absolute paths, empty path segments, `.` and `..` are rejected. The heading must be a Markdown heading such as `## Calendar`.

## Command and managed section

Run the command from the command palette. The bridge determines one local `targetDate`, and the plugin validates it before resolving or creating that exact Daily Note. If the configured core Daily Notes folder is missing, its parent folders are created safely before discovery. It then replaces the section between:

```markdown
<!-- calendar-daily-note-linker:start -->
<!-- calendar-daily-note-linker:end -->
```

All-day events appear first, followed by timed events ordered by start time. Timed events use the bridge's local timezone. If there are no events, the section says `No calendar events today.`. Other Daily Note content is preserved.
