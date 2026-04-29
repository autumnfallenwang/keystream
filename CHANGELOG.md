# Changelog

All notable user-visible changes to Keystream.

Format: Keep a [Changelog](https://keepachangelog.com/en/1.1.0/). Version tags follow SemVer.

## [Unreleased]

- Sidebar: file explorer is now a real collapsible "Explorer" section with a header chevron; visible hairline rules separate the sidebar's three zones.
- Sidebar: opening a single file (no folder) shows that filename as a one-row indicator in the Explorer; clicking re-loads from disk.
- File explorer: every file row is clickable. Picking a binary or oversized file (or one without a known text extension) loads a friendly warning view in the main panel with a "← Back" button — VSCode-style — instead of being blocked at the row level.
- Open file… dialog: no longer filters by extension. Any file is pickable; UTF-8 / size check happens at read time.
- Sidebar scrolling: disabled the macOS rubber-band overscroll bounce.
