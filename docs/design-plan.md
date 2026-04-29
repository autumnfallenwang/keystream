# Keystream Design Plan

This document captures the architecture, data flow, visual contract, and load-bearing decisions. The **Locked Decisions** section is append-only — never edit past entries without user approval.

## Goal

Reliably type arbitrary text into a remote virtual desktop or RDP session when the clipboard is blocked. Target user is a Mac operator working into a Windows VM; cross-platform ports are future work.

## v2 architecture: linear, no OCR

After v1's per-chunk OCR-verify loop and the keystroke-injection study (see [`lessons.md`](lessons.md) "poc2 — keystroke injection method" entry), we settled on a much simpler design: **type the text and stop**. No OCR, no per-chunk verify, no fail-and-retry handshake. The poc2 study validated the keystroke sender at 0 / 45,051 chars across three 15k-character runs on AVD — at that reliability level, OCR-verify is solving a problem that no longer exists.

**Removed vs v1:** OCR pipeline (`ocr_helper` Swift sidecar, fold table, LCS alignment, chunk stitching, scroll-verify), region calibration, per-chunk verify, fail handshake, auto-rollback (Q11 retired), line-length pre-check, Screen Recording permission.

**Kept:** keystroke sender (with Q12 Private-source fix), pre-send countdown, cooperative Stop, Accessibility permission, text persistence.

## Three-layer architecture

1. **Rust core** (`typer-core/`) — platform-specific keystroke sender. No UI, no Tauri dep. Posts CGEvents using the cliclick recipe (Q1, Q2, Q3) with a `Private` event source (Q12).
2. **Tauri shell** (`src-tauri/`) — thin Rust wrapper. Exposes `typer-core` as `#[tauri::command]` handlers, owns permission probes and persistence.
3. **Next.js frontend** (`src/`) — React UI in Tauri's webview. Static export, no server.

Pure business logic (text loading, settings serialization, app state) lives in `src/lib/core/` — no platform imports, unit-testable without Tauri.

## Data flow (typical send)

```
frontend: user picks text or file → text loaded (edit mode)
frontend: user clicks "Lock" → text locked (read-only)
frontend: pre-task gates evaluated (text loaded+locked, Accessibility granted)
       Send button enabled only when both pass.

frontend: user clicks Send → invoke("run_send", {text, cfg, start_offset: 0})
 ├─ countdown countdownSecs seconds (user focuses target VM during this window)
 ├─ shift warmup (Q3)
 └─ for each char from start_offset:
     ├─ check control flag → pause-requested or stop-requested halt cleanly
     ├─ post CGEvent (cliclick recipe + Private source)
     ├─ emit SendProgress{chars_typed} every PROGRESS_INTERVAL chars
     └─ sleep event_pause_ms
 └─ emit SendComplete / SendPaused{position} / SendStopped{position}

resume = run_send with start_offset = paused_position. Same flow, fresh countdown.
```

## Tauri command surface (v2)

| Command | Purpose |
|---|---|
| `run_send(text, cfg, start_offset)` | Drive the linear send. Emits `SendProgress` / `SendPaused` / `SendStopped` / `SendComplete` over a typed Channel |
| `pause_send()` / `stop_send()` | Set the cooperative pause / stop flag |
| `get_settings()` / `save_settings(cfg)` | Read / persist the dials in Q13 + appearance in Q15 + sidebar width in Q19 |
| `check_permissions()` | Probe Accessibility |
| `open_settings_pane()` | Deep-link to System Settings on permission deny |
| `read_text_file` / `save_text` / `get_text` / `clear_text` | Text persistence |
| `pick_folder` / `read_folder_tree` (v2-8 pending) | File-explorer backend (Q18) |
| `get_state` / `save_state` (v2-8 pending) | Per-session ephemeral state — last folder, selected file, expanded paths (Q18) |
| `log_{info,warn,error}` / `open_log_dir` | Logging |

## Visual contract

**Aesthetic:** "Terminal Atelier" — a calibrated tool, not a friendly assistant. Composed, austere, slightly industrial, one electric accent. Reference points: Linear, JetBrains IDE chrome, Things 3.

**Palette tokens** (live in `src/app/globals.css`):

```
Backgrounds:  --bg-canvas / --bg-rail / --bg-elevated / --bg-hover / --bg-active
Borders:      --hairline / --hairline-soft / --hairline-strong
Foreground:   --fg-primary / --fg-secondary / --fg-tertiary / --fg-quaternary
Accent:       --accent / --accent-hover / --accent-press / --accent-glow
Status:       --ok / --warn / --alert
Scale:        --font-scale (Q15) / --sidebar-width (Q19)
```

Five palette profiles × light/dark are user-selectable per Q15: `atelier`, `solarized`, `nord`, `dracula`, `contrast`. Atelier-dark is the bare-`:root` baseline; other variants apply via `.theme-<profile>-<mode>` class on `<html>` (the `theme-provider.tsx` component manages this).

**Typography** (all loaded via `next/font/google` in `src/app/layout.tsx`):

| Use | Family | Size |
|---|---|---|
| Wordmark "Keystream" | Fraunces | 18px |
| Body / UI labels | Geist | 13px |
| Eyebrows (sidebar headings) | Geist Mono UPPERCASE | 10px |
| Numerical readouts | Geist Mono `tabular-nums` | 12–13px |
| Text panel + line numbers | JetBrains Mono | 13px / 11px |
| Countdown numerals | Fraunces | 220px |

Font family stack is locked (Q15). UI scale (`--font-scale`, range 50–200%) is the only typography knob.

**Window:** Tauri window 1280×820 default, 1000×700 minimum. No native macOS title bar; the sidebar's top region inset for traffic lights.

### Region map

The webview is two columns: a **resizable sidebar** (left) and the **main column** (right, fills remainder).

- **Region 1 — Sidebar** (resizable 180–600px, default 260px). Composition depends on whether v2-8 file explorer has shipped — see Region 1 detail below.
- **Region 2 — Main column.** Two vertical sub-regions (Q21 collapsed the original 2a/2c into a single consolidated header):
  - **2a. Consolidated header** (~56–60px) — filename (left) · Edit/Lock toggle, Wrap toggle, Send/Pause/Resume, Stop (right). Status line during send sits as a thin sub-row below. See Q21.
  - **2b. Body** — the text panel. Edit mode = `<textarea>` + sibling gutter. Locked mode = `<pre>` + gutter + active-line indicator (scanline + tinted background, Q16). Wrap toggle (Q21) flips between `white-space: pre` (default) and soft-wrap.
- **Region 3 — Countdown overlay.** Fullscreen frosted-glass scrim with Fraunces 220px numeral and a ring filling clockwise. Fires on every Send and Resume. Esc cancels (Q14).
- **Region 4 — Settings shell** (Q15). When entering Settings, the entire sidebar swaps to a Settings nav rail (`← Back to text` + Appearance / Timing / Advanced); the main column shows the active section's pane. Sections render through `<SettingsSection title help? card?>` (Q17): h2 title + optional `?` info icon (lucide `Info` with native tooltip) + card-wrapped content (`--bg-elevated`, hairline border, soft shadow, 16px padding). Reset to defaults lives in Advanced and inline-confirms (D-06 pattern).

### Region 1 detail (current — single sidebar pre-v2-8)

Pre-v2-8 sidebar has three vertical zones:

```
┌──────────────────────┐│  ← right edge: 4px invisible drag handle
│  Keystream           │   (Q19 — implementation pending in v2-9)
│  ─────────────────   │
│  📄 Current text     │  TOP region (fixed)
│  ⊕ Load file…        │
│  🗑 Clear            │  ← inline-confirms on click (D-06)
│                      │
│  HISTORY             │  MIDDLE — placeholder text only
│  Sent texts will…    │
│                      │
│  ─────────────────   │
│  ⚙ Settings          │  BOTTOM (fixed)
│  v0.1.0              │
└──────────────────────┘
```

**Region 1 redesign (v2-9 + v2-8 pending):** Q19 adds a drag handle for resize; Q18 replaces the Document/History groups with `Open file` + `Open folder` fixed-top buttons and a VSCode-style file-tree explorer in the middle. See Q18 below for the explorer's full contract and Q19 for the resize contract.

## Locked Decisions

Append-only. Q4–Q11 are RETIRED in v2 (the v1 OCR-pipeline decisions). Live decisions below — shipped phases get a one-line summary; pending phases get full detail.

### Shipped (v2-1 through v2-7)

- **Q1 — CGEvent + virtual keycodes, never unicode injection.** The RDP client we tested silently ignores `CGEventKeyboardSetUnicodeString` and forwards only the keycode. Keymap: US-ANSI Carbon HIToolbox keycodes. See `typer-core/src/keymap.rs`.
- **Q2 — Shift uses the cliclick raw-keycode recipe, not `CGEventFlags`.** Plain `keyDown(shift) → keyDown(char) → keyUp(char) → keyUp(shift)` with `event_pause_ms` sleeps. `setFlags(CGEventFlagShift)` does not survive RDP — every shifted char comes out unshifted. See `typer-core/src/sender.rs::send_char`.
- **Q3 — Shift warmup during countdown.** One dummy shift keyDown/keyUp pair before the first character. Always on. ~70ms invisible cost; defends against modifier-state edge cases. See `typer-core/src/sender.rs::warmup_shift`.
- **Q4–Q11 — RETIRED.** v1 OCR pipeline decisions (verify, fold, LCS align, chunked send, line-length check, fail UX, auto-rollback). Made obsolete by Q12. Findings preserved in `lessons.md`.
- **Q12 — `CGEventSourceStateID::Private` event source.** *The* v2 change. `Combined` mixes injected events with the user's physical keyboard state and corrupts modifier tracking under sustained typing. `Private` gives our injection an isolated state machine. One-line change in `typer-core/src/event_source.rs::session_default()`. Validated 0/45,051 chars on AVD. See `lessons.md` "poc2 — keystroke injection method" entry.
- **Q13 — Four user-tunable timing knobs.** `event_pause_ms` (default 10ms, floor 5/RDP-7), `mod_hold_ms` (10ms), `warmup_shift` (true), `countdown_secs` (3). Source state, tap location, event shape are HARDCODED — never expose. See `typer-core/src/config.rs`.
- **Q14 — Three control verbs (Send / Pause / Stop).** Backend tri-state `SendControl` (`Running` / `PauseRequested` / `StopRequested`). Resume = `run_send` with `start_offset = paused_position` (not a separate command). Both Send and Resume re-run the countdown. Stop resets position to 0. See `typer-core/src/control.rs`.
- **Q15 — Settings shell with sidebar nav (Appearance / Timing / Advanced).** Settings replaces the main sidebar with a nav rail. Default landing tab: Appearance. Five palette profiles + Light/Dark/System + UI scale. Settings persist to `<app_data_dir>/settings.json`. Schema includes `appearance: { profile, mode, fontSize }` with `#[serde(default)]` back-compat. See `src-tauri/src/settings.rs`.
- **Q16 — Text panel gutter shared across edit and lock modes; soft-wrap disabled.** Both modes render `<gutter><content>` with the gutter line-height anchored to the content row metric (`13px × 1.6 = 20.8px`). Edit mode uses scroll-sync (`onScroll` mirrors `scrollTop`). `white-space: pre` + `overflow-x: auto` everywhere — visual line count = physical line count. See `src/components/text-panel.tsx`.
- **Q17 — Settings sections render through `<SettingsSection title help? card?>` primitive.** Title row = h2 14px medium. Optional info icon via lucide `Info` with native `title` tooltip. Card-wrapped content (`--bg-elevated`, hairline border, soft shadow, 16px padding). `card={false}` opts out for self-shelled children. Section spacing: `space-y-5`. See `src/components/settings/section-primitives.tsx`.

### Pending — full spec for fire time

#### Q18 — File explorer sidebar (VSCode-style, replaces History) — Phase v2-8

**Decision:** The sidebar's middle region becomes a VSCode-style file explorer. Legacy `Document` group (Current text / Load file / Clear) and `History` placeholder are removed. Sidebar gains two fixed-top action buttons (`⬆ Open file`, `⊞ Open folder`) and one scrollable explorer panel below them.

**Tree contract:**

- **Per-folder collapse.** Every folder row has `▾` (open) / `▸` (collapsed) chevron. Click row OR chevron toggles. Files have no chevron; click selects-and-loads.
- **Indent.** +12px per nesting level. Files reserve a 14px chevron-spacer so file/folder columns align.
- **Row height.** 22px (denser than the 36px fixed rail rows).
- **Selection visual.** Active file row: `bg-bg-active` + 3px `accent` left edge bar.
- **Hover.** `bg-bg-hover`, instant.

**Icon system:** lucide-react, monochrome outline 14×14, with **per-extension tints**. Brand-color tints (e.g. `#3178c6` for TS, `#dea584` for Rust) preserve "I can recognize this from the icon" without bundling a 200KB icon font. Generic-text fallback uses `FileText` in `--fg-tertiary`. Non-text files render `FileX` in `--fg-quaternary`, **non-clickable** (cursor: not-allowed). Folders use `FolderOpen` (expanded) / `Folder` (collapsed) in `--fg-secondary`.

| Extensions | lucide icon | Tint |
|---|---|---|
| `.ts`, `.tsx` | `FileCode2` | `#3178c6` (TS blue) |
| `.js`, `.jsx`, `.mjs` | `FileCode2` | `#f7df1e` (JS yellow) |
| `.rs` | `FileCode2` | `#dea584` (Rust orange) |
| `.py` | `FileCode2` | `#3572a5` (Python blue) |
| `.go` | `FileCode2` | `#00add8` (Go cyan) |
| `.json`, `.json5`, `.jsonc` | `Braces` | `--fg-tertiary` |
| `.yaml`, `.yml`, `.toml` | `Settings2` | `--fg-tertiary` |
| `.md`, `.markdown` | `FileText` | `--fg-secondary` |
| `.html`, `.htm` | `Code2` | `#e34c26` |
| `.css`, `.scss`, `.less` | `Palette` | `#264de4` |
| `.sh`, `.bash`, `.zsh` | `Terminal` | `--fg-secondary` |
| `Dockerfile` | `Container` | `#0db7ed` |
| `.env*` | `KeyRound` | `--warn` |
| Generic text fallback | `FileText` | `--fg-tertiary` |
| Non-text | `FileX` | `--fg-quaternary` (inert) |
| Folder open / closed | `FolderOpen` / `Folder` | `--fg-secondary` |

**Text-file allowlist:** the same `TEXT_FILE_EXTENSIONS` constant used by `Open file` (`txt, md, log, rs, ts, tsx, js, jsx, py, go, json, yml, yaml, toml`) governs which tree rows are clickable. Non-text appears in the tree (so the user sees the folder honestly) but is dimmed and inert.

**Hidden / skipped paths:** filtered Rust-side, never reach the frontend — `.git`, `node_modules`, `target`, `.next`, `.svelte-kit`, `.DS_Store`, `.vscode`, `.idea`. Hard-coded in v2-8.

**Depth + node caps:** Rust traversal stops at 6 levels deep; per-folder it caps at 500 nodes. Both render a non-clickable `(+N more)` truncation row when hit. Prevents runaway memory / time on accidental wide opens (e.g. somebody opens `~/`).

**Rescan policy:** manual only. No live filesystem watcher. Re-reading a folder = clicking `Open folder` again.

**Selection → main-area transition:**

1. Click a clickable text file → backend `read_text_file(path)` → `setText(contents)`.
2. Frontend forces `setLocked(false)` — files always open in **edit mode** (Q14 invariant: only locked text can be sent).
3. App state stays `idle`. Send button stays disabled until the user clicks Lock.
4. Switching to a different file while in unlocked edit mode discards in-app edits silently — the file on disk is the source of truth.

**Persistence:** last-opened folder, currently-loaded file, and per-folder collapse state are saved to `<app_data_dir>/state.json` (separate from `settings.json` because state is ephemeral context, not user preference). Restored on launch. New Tauri commands `get_state` / `save_state`.

**Single-file mode:** if the user opens just one file via `Open file`, the explorer renders that single file as a one-row "tree" without any folder hierarchy. Same row geometry, no chevron-spacer.

**Why no live watcher / why no soft-wrap:** v2-8 ships the 80% case (folder of <500 files, <6 levels deep, no symlink loops, no live edits) and falls back gracefully on the 20%. Bigger workflows route through "open one file at a time."

#### Q19 — User-resizable sidebar width — Phase v2-9

**Decision:** Both the main `Sidebar` and the `SettingsSidebar` (Q15) support user-controlled width via a drag handle on the right edge. Width is persisted across sessions.

**Geometry:**

- **Default:** 260px (unchanged from current).
- **Range:** 180px floor to 600px ceiling. Outside-range values clamped on commit.
- **Drag handle:** 4px-wide invisible strip absolutely positioned at the sidebar's right edge (`absolute right-0 inset-y-0 w-1 cursor-col-resize`). Mouse-down captures, mouse-move updates live, mouse-up persists.
- **Double-click reset:** double-clicking the handle resets to 260px and persists.
- **Hover affordance:** subtle `bg-accent/30` tint on hover so users can find the handle. Otherwise invisible.

**Width source:**

- CSS custom property `--sidebar-width: 260px` on `:root`.
- Sidebar `<aside>` uses `style={{ width: 'var(--sidebar-width)' }}` instead of a Tailwind width class.
- During an active drag, the handle writes directly to `document.documentElement.style.setProperty('--sidebar-width', ...)` — bypasses React re-renders. On mouse-up, the final value commits via debounced `saveSettings()`.

**Persistence:** new field `sidebarWidthPx: u64` in `SettingsCfg`. `#[serde(default = "default_sidebar_width")]` returns `260` for v2-7-era files lacking the field. Same back-compat shape as the `appearance` field from Q15.

**Why both sidebars share the value:** there's a single visible sidebar at any time. One width applied to whichever sidebar is mounted is simpler than two values that desync.

**Why 180 floor:** below this, the action buttons start truncating their labels. Below ~150 the wordmark also clips.

**Why 600 ceiling:** the default 1280×820 window leaves 680px for the main column at 600 — usable but tight. Beyond that, users should resize the window.

#### Q20 — File explorer treats every row as a try-to-open candidate; UTF-8 is the gate, not extensions

**Decision:** Supersedes Q18's claim that "non-text files render `FileX` ... non-clickable" and that the `TEXT_FILE_EXTENSIONS` allowlist gates row clickability. Every file row is clickable. On click, the app attempts `read_text_file`; if the file isn't valid UTF-8 (or exceeds the 1 MiB cap), the main panel area swaps to a non-blocking warning view (filename + reason + a "← Back" button to restore the previously-loaded text). VSCode behaves the same way — it doesn't pre-judge by extension because Linux text files frequently have no extension at all (`Makefile`, `LICENSE`, `.bashrc`, `nginx.conf`).

**Mechanism:**
- Every file row in the tree is clickable. No `cursor-not-allowed`, no `disabled`. Folders still toggle on click.
- Click → `read_text_file(path)`. The Rust side already validates UTF-8 and the 1 MiB cap and returns a typed error string.
- On error: the main column body region (where TextPanel renders) swaps to a `<BinaryFileWarning>` view showing the filename, the underlying reason ("This file does not appear to be UTF-8 text" / "File too large: …"), and a "← Back" button. Clicking Back restores the previous text + lock state in the panel. The currently-loaded `text` state is **not** overwritten on failure.
- On success: load + select normally.
- Icons: still tinted by extension where we recognize one. Unknown / no-extension files use the generic `FileText` icon in `--fg-tertiary` (not the inert `FileX` in `--fg-quaternary` — that variant is retired).
- The `TEXT_FILE_EXTENSIONS` constant survives only as the default filter for the **Open file…** OS dialog (which still benefits from a sensible default filter); it no longer gates clickability anywhere.

**Why this isn't phase-sized:** No schema changes, no new IPC commands. Touches `file-tree.ts` (drop `isTextFile` gate), `file-explorer.tsx` (every row clickable, single icon path for unknowns), `page.tsx::handleSelectFile` (catch and surface the error), and a new `<BinaryFileWarning>` component in the main panel area. Plus tests.

#### Q21 — Consolidated main header (filename + Edit/Lock + Wrap + Send/Stop); footer action bar retired

**Decision:** Supersedes Q14's claim that the action bar is a separate 72px sticky footer with Send/Pause/Stop, and the visual contract's claim that Region 2a carries `✓ Text loaded` / `✓ Accessibility` gate chips. The main header becomes the single home for all per-file actions: filename (left) and Edit/Lock + Wrap + Send/Pause/Resume + Stop (right). Region 2c is removed; Region 2b (text panel) absorbs the freed pixels.

**Layout (left → right):**
- **Filename slot** — basename of the loaded file, e.g. `notes.txt`. Empty / `Untitled` when no file is loaded. The active-edge color and locked icon belong to the Edit/Lock toggle, not this slot.
- `flex-1` spacer.
- **Edit/Lock segmented switch** — same component as today (Q16-aligned).
- **Wrap toggle** — icon-only button (lucide `WrapText`). On = soft-wrap; off = `white-space: pre` (Q16 default).
- **Send button** (primary). Tri-state per Q14: `Send` → `Pause` (during sending) → `Resume` (during paused). Same accept-set.
- **Stop button** (secondary). Always present, only enabled during `sending` / `paused`.

**Status line during send:** thin sub-row below the header (`tabular-nums`, `--fg-tertiary`), not embedded in the header itself. This keeps the header buttons in stable positions during send.

**Gates retired from the header.** "Text loaded" and "Accessibility" gates no longer have a chip. They still gate `canSend` (Send disabled until both pass); the failure reason surfaces through the disabled-button hover/`title` and — for Accessibility — a small inline warning row above the text panel only when the grant is missing.

**Wrap state is per-session, not persisted.** Defaults to off (matching Q16's `white-space: pre`). If users want persistence later it's a separate D-NN.

**Visual contract update.** Region 2a grows ~52px → ~56–60px. Region 2c is gone. Header background remains `--bg-elevated`; bottom hairline shifts to between header and text panel only.

**Trade-offs accepted:**
- Loses the always-visible "Accessibility ✓" reassurance. Hover-tooltip on disabled Send communicates it on first failure.
- On narrower sidebars/windows the filename truncates. Q19 lets users widen the sidebar; the header has the full main-column width, so this is acceptable.

**Why this isn't phase-sized:** Single visual surface (the header). Touches `main-header.tsx`, retires `action-bar.tsx`, adds wrap state to `text-panel.tsx`, rewires `page.tsx`. No schema changes, no new IPC commands.

## Build phases (v2 rewrite)

The v1 phases (1–6 + Phase 2.5) are retired. v2 phases below — each anchored to its load-bearing Q-decision. Live status + completion tracking lives in [`progress.md`](progress.md).

| Phase | Anchor | One-line scope |
|---|---|---|
| v2-0 | `lessons.md` poc2 entry | Keystroke-injection method survey + RDP validation. |
| v2-1 | Q12 | Apply the `Private` source-state fix in shipped code. |
| v2-2 | Q14 | Strip OCR / chunking from `typer-core/`; add SendControl tri-state. |
| v2-3 | Q14 | Strip OCR / chunking from `src-tauri/`; add tri-verb command surface. |
| v2-4 | Q14, visual contract | Rewrite frontend for the v2 UI. |
| v2-5 | Q13 | Settings pane — 4 dials + persistence. |
| v2-7 | Q15, Q17 | Settings shell with sidebar nav + Appearance section. |
| v2-9 | Q19 | User-resizable sidebar width. Runs before v2-8. |
| v2-8 | Q18 | VSCode-style file explorer sidebar. Depends on v2-9. |
| v2-6 | — | Polish + ship. Runs last; depends on v2-9 + v2-8. |

For any pending phase, the implementation plan is drafted by `/dev-task` at fire time using the anchor Q-decision as the spec.

## Future work (deferred from v2)

- **Cross-platform.** Linux (`ydotool` / `xdotool`) and Windows (`SendInput`). Each is a separate research round; method behavior on those platforms is unknown.
- **Auto-correction / delete primitive.** v1's Q11 work (Shift+Up × N + Backspace) was validated on AVD. If a higher-error environment ever forces a verify mode again, the primitive is documented in `lessons.md`.
- **Re-test other RDP/VDI clients.** All v2 validation was Microsoft Windows App on AVD. Citrix, VMware Horizon, Parallels Client may behave differently.
- **Per-VM speed profiles.** Q13 dials are global today; per-target named profiles ("AVD slow", "Citrix fast") are a possible future addition.
- **Live filesystem watcher** for the file explorer (Q18). Manual rescan only in v2-8.
- **D-01 — global hotkeys** for Pause/Stop while RDP has focus (deferred; tracked in `backlog.md`).
