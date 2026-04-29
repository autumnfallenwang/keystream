# Backlog

Findings discovered via the walkthrough skill. One row per finding, grouped by type (`B-NN` bugs · `D-NN` design changes). Status cycles: `open` → `in-progress` → `done` (or `rejected` / `deferred` / `promoted to Phase v2-N`). Phase-sized work doesn't live here — it gets promoted to a phase row in [`progress.md`](progress.md) and gains a Q-decision in [`design-plan.md`](design-plan.md).

Rows below are listed newest-first within each type.

## Bugs

### B-03 — Lock-mode gutter line numbers misaligned with content rows
**Where:** `src/components/text-panel.tsx::LockedView`
**Observed:** Gutter rendered line numbers at `text-[11px] leading-[1.6]` (row height 17.6px) while content `<pre>` rendered at `text-[13px] leading-[1.6]` (row height 20.8px). Two columns drifted apart at every row; `--font-scale` from Q15 amplified the visible mismatch.
**Fix:** Anchored gutter row line-height to the content row metric (`1.6 × 13px = 20.8px`) while keeping line numbers at the smaller 11px font. Locked under Q16.
**Status:** done

### B-02 — Active-line indicator stuck on line 1 during a send
**Where:** `typer-core/src/sender.rs`, `src-tauri/src/send.rs`, `src/lib/core/app-state.ts`, `src/components/text-panel.tsx`
**Observed:** During a real send, the active-line indicator never advanced from line 1. Root cause: `run_send` had no mid-loop progress callback; `charsTyped` only updated on terminal IPC events.
**Fix:** Added optional `progress: Option<&mut dyn FnMut(usize)>` to `run_send`, `SendEvent::SendProgress { chars_typed }` Channel variant, `ipcSendProgress` reducer event. Throttled to once per `PROGRESS_INTERVAL = 50` chars.
**Status:** done

### B-01 — Send button stuck disabled after Stop from a paused send
**Where:** `src/app/page.tsx` — `canSend` derivation
**Observed:** After Stop from paused, the reducer correctly transitioned to `stopped` mode but `canSend` was hardcoded to `mode === "idle"`, so the Send button never re-enabled.
**Fix:** Relaxed `canSend` to allow `idle | done | stopped` — matches the reducer's `sendClicked` accept-set.
**Status:** done

## Design changes

### D-13 — Consolidated main header: filename + Edit/Lock + Wrap toggle + Send/Stop; retire footer action bar
**Where:** `src/components/main-header.tsx`, `src/components/action-bar.tsx` (retired), `src/components/text-panel.tsx` (wrap), `src/app/page.tsx` (wiring), plus visual-contract update in `design-plan.md`.
**Observed:** Current header carries two gate chips (✓ Text loaded, ✓ Accessibility) + Edit/Lock toggle. The 72px sticky footer action bar carries Send/Pause/Stop + the during-send status line. User wants: drop the gate chips, show the loaded filename instead; eliminate the footer entirely; pull Send/Stop into the header alongside Edit/Lock; add a Wrap-long-lines toggle; arrange the four controls cohesively.
**Locked under:** Q21 in `design-plan.md` (supersedes Q14 visual contract Region 2a/2c claims).
**Status:** in-progress (Q21 locked, awaiting fire)

### D-12 — Try-as-text for any file the user clicks (no extension allowlist)
**Where:** `src/components/file-explorer.tsx`, `src/lib/core/file-tree.ts::isTextFile`, `src/app/page.tsx::handleSelectFile`, plus a new `<BinaryFileWarning>` component in the main panel area.
**Observed:** Q18 currently blocks non-allowlist files (PNG, MP3, .db, etc.) at the row level — they render dimmed and inert. User wants VSCode-style behavior: every row is clickable, the app tries to read it as text, and if the contents aren't valid UTF-8, surface a clear warning view inside the main panel with a "← Back" button. Linux text files often have no extension at all, so the allowlist over-blocks.
**Locked under:** Q20 in `design-plan.md` (supersedes Q18's allowlist gate).
**Status:** done — 1070603

### D-11 — Sidebar sections need separator rules between them
**Where:** `src/components/sidebar.tsx`.
**Observed:** Top action rows, the file-explorer section, and the bottom Settings/version block all sit in the sidebar without visual separation. The footer block already has `border-t border-hairline-soft` — the explorer section above it has no equivalent above-line.
**Proposed:** Add hairline separators between sidebar sections so the structure reads at a glance.
**Status:** done — 1070603

### D-10 — File/folder section in sidebar needs a section header with collapse
**Where:** `src/components/sidebar.tsx`, `src/components/file-explorer.tsx`.
**Observed:** The file-explorer area sits directly below the action rows with no section header. Other sidebars (Settings) use eyebrows. Q18 mentions a root-name eyebrow inside FileExplorer but it only appears once a folder is loaded, and there's no collapse affordance for the whole section.
**Proposed:** Promote the explorer to a real sidebar section with a fixed header label (e.g. "Explorer") and a chevron that collapses the entire content. Distinct from per-folder collapse inside the tree.
**Status:** done — 1070603

### D-09 — After Open file (single file), show that filename in the explorer area
**Where:** `src/components/sidebar.tsx`, `src/components/file-explorer.tsx`, `src/app/page.tsx::handleLoadFile`.
**Observed:** When the user uses **Open file…** for a single file (no folder context), the explorer area still shows "No folder loaded." The file is loaded into the panel but the sidebar doesn't reflect it — there's no way to confirm at a glance which file is currently active.
**Proposed:** When a single file is loaded (no folder), render a single-row indicator in the explorer area showing just that filename, with the same active-edge styling as a selected tree row.
**Status:** done — 1070603

### D-08 — VSCode-style file explorer sidebar
**Where:** `src/components/sidebar.tsx`, plus new `src/components/explorer/` directory and new Rust `pick_folder` + `read_folder_tree` commands.
**Observed:** Single-file picker is enough for one-shot text drops but not for browsing a project tree. User wants `Open folder` alongside `Open file`, with a collapsible VSCode-style tree below the action buttons.
**Promoted:** Phase-sized. Locked under Q18 in [`design-plan.md`](design-plan.md). Tracked as **Phase v2-8** in [`progress.md`](progress.md).
**Status:** promoted to Phase v2-8

### D-07 — Drag-to-resize sidebar
**Where:** `src/components/sidebar.tsx`, `src/components/settings-sidebar.tsx`, `src/app/globals.css`, `src-tauri/src/settings.rs`.
**Observed:** Sidebar fixed at 260px. With v2-8's file explorer landing soon and existing long sidebar items (palette names, "Reset to defaults"), the fixed width frequently truncates content uncomfortably.
**Promoted:** Phase-sized (multi-file, schema change, new component, persistence wiring, drag-event handling). Locked under Q19 in [`design-plan.md`](design-plan.md). Tracked as **Phase v2-9** in [`progress.md`](progress.md).
**Status:** promoted to Phase v2-9

### D-06 — Inline confirm/cancel for destructive actions
**Where:** `src/components/sidebar.tsx` (Clear text), `src/components/settings/advanced-section.tsx` (Reset to defaults).
**Observed:** Both Clear text and Reset to defaults fired on a single click with no confirmation; either is irreversible.
**Fix:** Adopted teacherease's two-state inline pattern. Sidebar Clear row swaps into a compact inline confirm; Advanced Reset section swaps into a wider tinted confirm panel. Stop button stays one-click (time-sensitive control during active send — adding a confirm there worsens UX).
**Status:** done

### D-05 — Adopt teacherease's section grammar (title + ? + card-wrapped content)
**Where:** `src/components/settings/section-primitives.tsx` + all three section components.
**Observed:** Settings sections used a small Geist Mono UPPERCASE eyebrow with content packed below. User wanted the teacherease pattern: regular-size subtitle row (h2, 14px medium) with optional `?` info-icon helper that surfaces tooltip text, content wrapped in a rounded card.
**Fix:** New `<SettingsSection title help? card? children />` primitive. Migrated all three section components (Appearance / Timing / Advanced). Locked under Q17.
**Status:** done

### D-04 — Add Dracula as a 5th palette profile
**Where:** `src/lib/core/appearance.ts`, `src/app/globals.css`.
**Observed:** v2-7 shipped with 4 palette profiles (Atelier / Solarized / Nord / Contrast). Teacherease offers 5; user wanted parity with Dracula (purple / pink / cyan).
**Fix:** Added `"dracula"` to `THEME_PROFILES`, label, description, and `.theme-dracula-{dark,light}` blocks in `globals.css`.
**Status:** done

### D-03 — Add gutter + line numbers to edit mode
**Where:** `src/components/text-panel.tsx::EditView`, plus Q16 in `design-plan.md`.
**Observed:** Edit mode rendered a bare `<textarea>` with no gutter. User wanted the gutter visible in both modes for visual continuity (you can see your line position before locking).
**Fix:** Per Q16: added a sibling `<div>` gutter to the left of the textarea, mirroring the lock-mode geometry. Scroll-sync via textarea `onScroll`. Soft-wrap disabled. No active-line indicator (edit has no send).
**Status:** done

### D-02 — Settings shell with sidebar nav + Appearance tab (theme + UI scale)
**Where:** `src/components/settings-page.tsx`, `src/app/globals.css`, `src-tauri/src/settings.rs`.
**Observed:** Settings was a single scrollable page. User wanted a multi-section shell with theme + UI scale controls (referencing teacherease), navigated via sidebar that replaces the main sidebar while in Settings.
**Promoted:** Phase-sized. Locked under Q15 in `design-plan.md`. Shipped as Phase v2-7.
**Status:** promoted to Phase v2-7

### D-01 — Pause/Stop requires two clicks because RDP owns focus during send
**Where:** `src/app/page.tsx` action bar + (future) `src-tauri` global-shortcut plugin.
**Observed:** During an active send, RDP must have focus. Clicking our app to Pause/Stop requires a first click to restore window focus (typing keeps going meanwhile) and a second click to actually hit the button. In-app keyboard shortcuts don't help — they only fire when our app has focus.
**Proposed:** Register OS-level global hotkeys via `tauri-plugin-global-shortcut` — e.g. `⌃⌥⌘P` for Pause/Resume toggle and `⌃⌥⌘S` for Stop. Triple-modifier combos avoid collisions with RDP/Citrix and normal Mac apps.
**Deferred:** Pause is not a foundational v2 feature — the byte-perfect sender means full runs complete cleanly without intervention. Revisit when/if a real interruption use case forces the issue.
**Status:** deferred
