# Changelog

All notable user-visible changes to Keystream.

Format: Keep a [Changelog](https://keepachangelog.com/en/1.1.0/). Version tags follow SemVer.

## [Unreleased]

## [0.1.3] — 2026-04-29

- New app icon: periwinkle pencil on an off-white rounded square (replaces the default Tauri icon).
- New Settings → About tab. Shows the installed version, a "Check now" button, and an Install flow when an update is available. The `v0.1.x` footer at the bottom of the sidebars is gone — version info lives in About now.
- Auto-updater wired end-to-end. Future versions can be installed in-place from Settings → About after this release.

## [0.1.2] — 2026-04-29

First public release. macOS arm64 only.

- Main header redesign: filename slot replaces the gate chips; Edit/Lock, a new Wrap toggle, and Send/Pause/Resume/Stop now all live in the header. The footer action bar is gone — the text panel uses the freed pixels. Status during a send appears as a thin sub-row under the header.
- Soft-wrap: new toggle in the header wraps long lines in both edit and lock modes (per session, defaults off).
- Accessibility prompt: when the grant is missing, a thin amber row appears above the text panel and links to System Settings.
- Sidebar: file explorer is now a real collapsible "Explorer" section with a header chevron; visible hairline rules separate the sidebar's three zones.
- Sidebar: opening a single file (no folder) shows that filename as a one-row indicator in the Explorer; clicking re-loads from disk.
- File explorer: every file row is clickable. Picking a binary or oversized file (or one without a known text extension) loads a friendly warning view in the main panel with a "← Back" button — VSCode-style — instead of being blocked at the row level.
- Open file… dialog: no longer filters by extension. Any file is pickable; UTF-8 / size check happens at read time.
- Sidebar scrolling: disabled the macOS rubber-band overscroll bounce.
