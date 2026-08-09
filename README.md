# Calendar Daily Note Linker

Calendar Daily Note Linker is a macOS desktop-only Obsidian plugin that imports macOS Calendar events into the currently open, existing Daily Note.

## What it does

- Reads events through macOS EventKit; it does not script Calendar.app.
- Imports events for the date represented by the active configured Core Daily Note or Periodic Note, including historical dates.
- Replaces the one managed `## Calendar` section below `# Notes` in that note.
- Renders all-day events first, then timed events in the Calendar bridge's local timezone.
- Optionally links uniquely matched vault notes in event titles and Calendar event URLs.

The plugin never creates, opens, or switches Daily Notes. Open the target note first, then run **Import Calendar events into active Daily Note**.

## Requirements

- macOS desktop
- Obsidian 1.5.0 or later
- Core Daily Notes or Periodic Notes configured
- Calendar access granted to Obsidian when macOS requests it

The plugin is intentionally desktop-only and does not support Windows, Linux, or mobile Obsidian.

## Installation

### Beta installation with BRAT

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat).
2. Add `ryanmccool/obsidian-calendar-dailynote-linker` as a beta plugin.
3. Enable **Calendar Daily Note Linker** and configure Core Daily Notes or Periodic Notes.

BRAT downloads the loose `main.js` and `manifest.json` assets from a matching GitHub release.

### Manual installation

Download `main.js` and `manifest.json` from the matching [GitHub release](https://github.com/ryanmccool/obsidian-calendar-dailynote-linker/releases), then place both files in:

```text
<vault>/.obsidian/plugins/calendar-daily-note-linker/
```

Restart Obsidian or reload community plugins, then enable the plugin.

## Use

1. Open an existing Daily Note that matches your Core Daily Notes or Periodic Notes configuration.
2. Run **Import Calendar events into active Daily Note** from the Command Palette.
3. The plugin updates the visible `## Calendar` section below the note's one `# Notes` heading.

A generated block looks like:

```markdown
## Calendar
### Planning
09:00 – 09:30
```

If no events are found, the section records that result for the active note's date.

## Settings

### Calendars

By default, imports include every event calendar available to macOS. To limit imports:

1. Turn off **Sync all calendars**.
2. Select **Refresh calendars**.
3. Enable the individual calendars to import.

Selections use EventKit calendar identifiers, so calendars with duplicate display names remain distinct. Selecting no available calendars intentionally produces an empty import.

### Formatting and vault links

- Set event heading levels from Heading 3 through Heading 6.
- Choose 24-hour or 12-hour times.
- Enable or disable vault-note matching and Calendar URL links.
- Exclude vault-relative folders from vault-note matching, one path per line.

Vault-note matching is deterministic: ambiguous names are never linked.

## Permissions and privacy

The plugin uses `/usr/bin/osascript` with macOS EventKit. The first import or calendar refresh can request Calendar access in **System Settings → Privacy & Security → Calendars**.

Calendar event data is processed locally to render the active Daily Note. The plugin does not send Calendar data, vault contents, event titles, attendees, or settings to a third-party service. It makes no network requests at runtime. Event locations and notes are not read or written.

## Development and releases

```sh
npm install
npm test
npm run build
```

For each release:

1. Bump the version in `package.json`, `package-lock.json`, and `manifest.json`.
2. Run tests and the production build.
3. Create a GitHub release whose tag exactly matches `manifest.json` (for example, `0.4.1`, not `v0.4.1`).
4. Upload loose `main.js` and `manifest.json` release assets.

When `minAppVersion` changes, update `versions.json` so Obsidian can install the latest compatible plugin version.

## Support

Report bugs and feature requests in the [GitHub issue tracker](https://github.com/ryanmccool/obsidian-calendar-dailynote-linker/issues). Include your macOS and Obsidian versions, plugin version, reproducible steps, and any relevant console or Notice text. Do not include private Calendar event contents unless necessary and redacted.

## License

[MIT](LICENSE)
