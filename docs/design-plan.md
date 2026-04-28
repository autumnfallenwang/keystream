# Keystream Design Plan

This document captures the architecture, data flow, and the "why" behind each decision. The **Locked Decisions** section is append-only — never edit past entries without user approval.

## Goal

Reliably type arbitrary text into a remote virtual desktop or RDP session when the clipboard is blocked. Target user is a Mac operator working into a Windows VM; cross-platform ports are future work.

## v2 architecture: linear, no OCR

After v1's per-chunk OCR-verify loop and the [poc2 keystroke-injection study](poc2-results.md), we settled on a much simpler design: **type the text and stop**. No OCR, no per-chunk verify, no fail-and-retry handshake. The poc2 study validated the keystroke sender at 0 / 45,051 chars across three 15k-character runs on AVD — at that reliability level, OCR-verify is solving a problem that no longer exists.

Removed compared to v1:
- OCR pipeline (`ocr_helper` Swift sidecar, `ocr.rs`, fold table, LCS alignment, chunk stitching, scroll-verify)
- Region calibration (no OCR → no region to capture)
- Per-chunk verify loop, chunk pass/fail events, ack handshake
- Skip / Stop / Continue fail handling
- Q11 auto-rollback (no fail to retry)
- Line-length pre-check (Q8 was only needed because OCR couldn't see horizontally-scrolled lines)
- Screen Recording permission

Kept:
- Keystroke sender (with the new Private-source fix — see Q12)
- Pre-send countdown
- Stop button (cooperative cancel)
- Accessibility permission
- Text persistence

## Three-layer architecture

1. **Rust core** (`typer-core/`) — platform-specific keystroke sender. No UI, no Tauri dependency. Sender posts CGEvents using the cliclick recipe (Q1, Q2, Q3) with a `Private` event source (Q12).
2. **Tauri shell** (`src-tauri/`) — thin Rust wrapper. Exposes `typer-core` as `#[tauri::command]` handlers, owns permission probes and persistence.
3. **Next.js frontend** (`src/`) — React UI in Tauri's webview. Static export (`output: 'export'`), no server.

Pure business logic (text loading, settings serialization) lives in `src/lib/core/` — no platform imports, unit-testable without Tauri.

## Data flow (typical send)

```
frontend: user pastes text or picks file → text loaded (edit mode)
frontend: user clicks "Lock" → text locked (read-only)
frontend: pre-task gates evaluated:
  ├─ text loaded + locked?
  └─ Accessibility permission granted?
       Send button enabled only when both pass.

frontend: user clicks Send → invoke("run_send", {text, cfg, start_offset: 0})
 ├─ countdown COUNTDOWN_SECS seconds (user clicks into target VM during this window)
 ├─ shift warmup (Q3)
 └─ for each char in text starting from start_offset:
     ├─ check control flag:
     │   ├─ pause-requested → halt, emit "send-paused" {position}, await resume
     │   └─ stop-requested  → halt, emit "send-stopped" {position}
     ├─ typer-core::send_char (cliclick recipe + Private source)
     ├─ emit "send-progress" {chars_typed, total_chars}  (throttled, e.g. every 100 chars)
     └─ sleep event_pause_ms
 └─ emit "send-complete" {chars, duration_ms, skipped}

resume:
frontend: user clicks Resume → invoke("run_send", {text, cfg, start_offset: paused_position})
  → same flow, starting from the paused index
```

Linear. No verify, no retry, no chunking. Three control verbs: **send / pause / stop** (Q14). Pause halts at the current char; Resume restarts from there with a fresh countdown. Stop halts and resets to the beginning — next Send starts from char 0.

## Tauri command surface (v2)

Down from 16 commands in v1 to ~9:

| Command | Purpose |
|---|---|
| `run_send(text, cfg, start_offset)` | Drive the linear send from `start_offset`. Emits `send-progress` / `send-paused` / `send-stopped` / `send-complete` |
| `pause_send()` | Set the cooperative pause flag (loop halts at next char, holds position) |
| `stop_send()` | Set the cooperative stop flag (loop halts and position resets to 0) |
| `get_settings()` / `save_settings(cfg)` | Read / persist the 4 dials in Q13 |
| `check_permissions()` | Probe Accessibility |
| `open_settings_pane()` | Deep-link to System Settings on permission deny |
| `read_text_file` / `save_text` / `get_text` / `clear_text` | Persistence |
| `log_{info,warn,error}` / `open_log_dir` | Logging |

Control flag is tri-state in `typer-core` — `running` / `pause_requested` / `stop_requested`. Resume isn't a separate command: the frontend just calls `run_send` again with `start_offset = last paused position`.

Removed v1 commands: `calibrate`, `get_region`, `clear_region`, `check_lines`, `verify_visible`, `scroll_verify`, `continue_after_fail`, `send_with_chunked_verify`.

## Frontend layout (v2)

**Style:** modern desktop-app workspace pattern — left rail + main column, like Notion / Linear / Claude Desktop. Min window size 1000×700.

```
┌────────────────────┬────────────────────────────────────────────────┐
│  Keystream         │  ✓ Text  ✓ Accessibility        [✎ Edit/🔒]   │ ← main header
│                    ├────────────────────────────────────────────────┤
│  ─ DOCUMENT ────   │                                                │
│  📄 Current text   │   1  function Foo(bar) { return bar.baz(); }  │
│  📁 Load file...   │   2  const Q = (x) => ({ ... });              │
│  🗑 Clear          │   3  class Server { listen(port) { ... } }    │
│                    │   ...                                          │ ← main body
│  ─ HISTORY ────    │   268  await Promise.all([...]).then(...);    │  (text panel,
│  ▸ snippet 1       │                                                │   monospace,
│  ▸ snippet 2       │                                                │   line numbers)
│  ▸ snippet 3       │                                                │
│                    │                                                │
│                    │                                                │
│                    │                                                │
│                    ├────────────────────────────────────────────────┤
│                    │  Typing 4,521 / 15,017 · 18.4s                │ ← status line
│                    ├────────────────────────────────────────────────┤  (during send only)
│  ⚙ Settings       │              [⏸ Pause]              [⏹ Stop] │ ← action bar
│  v0.1.0            │                                                │  (sticky to main)
└────────────────────┴────────────────────────────────────────────────┘
   sidebar (~240px)              main column (fills)
```

**Two columns. No global footer.** Action bar lives at the bottom of the main column (sticky there, not the whole window) — actions stay anchored to the content they act on.

### Sidebar (~240px wide)

- **Top:** App name / logo.
- **Document section:**
  - `📄 Current text` (selected when working on the loaded text)
  - `📁 Load file...` (opens Tauri file dialog)
  - `🗑 Clear` (wipes the current text)
- **History section** (auto-saved snippets — last N sends, click to reload into Current text):
  - List of recent text inputs, abbreviated.
  - Future: saved profiles for per-VM settings.
  - Acceptable to be empty / minimal at v2 launch — fills as the user uses the app.
- **Bottom-left footer:**
  - `⚙ Settings` — opens settings as a separate main-area page (replaces the text panel until dismissed).
  - App version label below it (small, dimmed).

### Main header (~52px)

- **Left:** gate indicators — `✓ Text` and `✓ Accessibility`. Click ✗ to remediate. During send/pause/stopped/done, this area swaps to a status indicator (see below).
- **Right:** `[✎ Edit / 🔒 Lock]` toggle for the text panel. Edit/Lock is text-panel-scoped so it lives in the document toolbar, not the action bar.

### Main body (text panel)

- Monospace, line numbers in left gutter.
- **Edit mode**: editable as a textarea. Send button disabled.
- **Locked mode**: read-only. Send button enabled if both gates pass.
- Default mode after Load File / Clear: edit. Default after first Send: locked.
- During send/pause, mode is forced to locked (toggle disabled).
- **Active position indicator (Q14)**: subtle blue left-border on the line currently being typed. Updates from `send-progress`. When paused, stays on the paused line (does not blink). Cleared when send completes or stops.

### Status line (~32px, only visible during/after send)

Thin row immediately above the action bar. Replaces the gate indicators in the main header *and* shows progress text below it during a run, so the user has visual reinforcement at both edges of the main column.

States:
- `Typing 4,521 / 15,017 chars · 18.4s elapsed` — sending
- `⏸ Paused at 4,521 / 15,017 chars` — paused
- `✓ Done · 15,017 / 15,017 chars · 60.2s` — done (reverts to gates after ~3s)
- `⏹ Stopped at 4,521 / 15,017 chars` — stopped (reverts to gates on next Send click)

### Action bar (~64px, sticky to main column bottom)

Centered (or right-aligned) row of two buttons:

| App state | Primary button | Secondary button |
|---|---|---|
| Idle / done / stopped | `▶ Send` | `⏹ Stop` (disabled) |
| Sending | `⏸ Pause` | `⏹ Stop` (enabled) |
| Paused | `▶ Resume` | `⏹ Stop` (enabled) |

- Primary button toggles Send ↔ Pause ↔ Resume per Q14.
- Stop is always present, only enabled during send/pause.
- Esc key is bound to Pause (during sending) or Stop (during paused/stopped) per current state.

### Countdown overlay

Fires on every Send and every Resume (Q14: re-focus the AVD window after pausing). Covers the whole window: `3 → 2 → 1 → GO`. Disappears on first keystroke. Cancel button visible (Esc also cancels).

### Settings page

Click `⚙ Settings` in the sidebar bottom-left → main column swaps from the text panel to a settings view (the sidebar stays). Four dials per Q13 + a "Reset defaults" button + a "Back" affordance to return to the text panel. Persisted to `<app_data_dir>/settings.json`.

### What's gone vs v1
- Region indicator + calibrate flow + region_picker overlay
- Lines indicator (line-length pre-check) + offending-line highlights
- Per-chunk visual states (untouched / in-progress / pass / fail / stopped)
- Inline failed-chunk diff renderer + Skip / Stop / Continue UX
- Auto-scroll-to-in-progress-chunk

Settings pane (Q13): four dials (`event_pause_ms`, `mod_hold_ms`, `warmup_shift`, `COUNTDOWN_SECS`). See Q13.

### Style references
- **Notion** — left workspace nav, main canvas
- **Linear** — left rail with sections + bottom user/settings affordance
- **Claude Desktop** — left conversation history, main panel with sticky-bottom input

The pattern is: action controls anchor to their content (action bar bottom of main, not bottom of window); the sidebar holds nav-like things (settings, history, profiles); no global app footer.

## Locked Decisions

Decisions below are load-bearing. Ordering preserved chronologically. Q4–Q11 are retired in v2 (kept here as historical record); the keystroke fundamentals (Q1, Q2, Q3) and the v2 additions (Q12, Q13) are the live design.

### Q1 — Sender uses CGEvent with virtual keycodes, not unicode injection

**Status:** active in v2.

**Decision:** On macOS, keystrokes are posted via `CGEvent::new_keyboard_event` with US-ANSI Carbon HIToolbox keycodes. Unicode injection (`CGEventKeyboardSetUnicodeString`) is never used.

**Why:** The RDP client we tested against (Microsoft's "Windows App") silently ignores the unicode string and forwards only the virtual keycode. A test with `CGEventKeyboardSetUnicodeString` set to "Hello world" + keycode 0 produced 11 `a`s in the remote VM's Notepad. Keycodes work; unicode does not.

**Source:** [`docs/poc/typer/src/keymap.rs`](poc/typer/src/keymap.rs).

### Q2 — Shift uses the cliclick raw-keycode recipe, not `CGEventFlags`

**Status:** active in v2. Re-confirmed by poc2 (every `setFlags(CGEventFlagShift)` permutation catastrophically fails on AVD).

**Decision:** Shifted characters are sent via plain `keyDown(shift) → keyDown(char) → keyUp(char) → keyUp(shift)` with `event_pause_ms` sleeps between events. No `CGEventFlags::CGEventFlagShift`, no `flagsChanged` events.

**Why:** Apple's flag-based approach does not survive the RDP hop. poc2 tested every source × tap permutation with `setFlags`; all produced 100% catastrophic shift-drops on AVD (every shifted char came out unshifted). The cliclick keycode-sandwich shape is the only RDP-survivable variant.

**Source:** [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) `send_char()`. Re-confirmed: [`docs/poc2-results.md`](poc2-results.md).

### Q3 — Shift warmup during countdown

**Status:** active in v2 (kept defensively; warmup may be redundant with Q12 but the cost is negligible).

**Decision:** Before the first character of a send, while the countdown is displaying, send one dummy shift keyDown/keyUp pair (`mod_hold_ms` hold, `WARMUP_SETTLE_MS` settle). Always on.

**Why:** Without warmup against the original Combined-source config, the first shifted character of a session often dropped (`Hello` → `hello`). With Q12's Private source the symptom doesn't reproduce, but the warmup adds ~70ms of dummy keystrokes during a window where the user is already waiting for the countdown — invisible cost, free safety.

**Source:** [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) `warmup_shift()`.

### Q4–Q11 — RETIRED

These v1 decisions (OCR pipeline, scrolling for OCR, LCS alignment, chunked verify, line-length check, per-chunk pass criterion, fail-and-surface UX, auto-rollback) are no longer applicable in v2. Q12 made them unnecessary.

The full text of Q4–Q11 is preserved in the git history (commit before the v2 design rewrite) and the *findings* live on:
- The "no flags over RDP" rule (was in Q2's reasoning) → reaffirmed in Q2 above
- The OCR fold-table failures and LCS alignment work → archived in [`docs/poc/`](poc/) reference materials and `lessons.md`
- Q11's delete-primitive probe → kept as future work in case auto-correction returns; see `lessons.md` 2026-04-24 entry

### Q12 — Use `CGEventSourceStateID::Private` for the event source

**Status:** active in v2. **The key v2 change.**

**Decision:** Construct the `CGEventSource` with `CGEventSourceStateID::Private`, not `CombinedSessionState`. Tap location stays at `Session` (default).

**Why:** v1 used `CombinedSessionState`, which mixes our injected events with the user's physical keyboard state. Under sustained typing this corrupts modifier tracking and intermittently drops shift, surfacing as the v1 live-AVD smoke shift-drop pattern (`(` → `9`, `Q` → `q`, etc.). `Private` source gives our injection an isolated modifier-state machine. poc2 validated 0 / 45,051 chars across three 15k-char runs on AVD/Notepad with this single change.

This is a one-line change in `typer-core/src/event_source.rs::session_default()`. The event shape (cliclick sandwich, Q2) is unchanged, so all existing trait infrastructure and tests apply unchanged.

**Why not flag-on-char (KeePassXC pattern):** poc2 confirmed this fails 100% on AVD — RDP forwarder strips `CGEventFlags`. Locally clean, AVD catastrophic.
**Why not HID tap location:** poc2 showed tap layer alone doesn't fix the shift-drop; it's the source state that matters.

**Source:** [`docs/poc2-results.md`](poc2-results.md).

### Q13 — Four user-tunable timing knobs; everything else hardcoded

**Status:** active in v2.

**Decision:** Settings surface exposes exactly four dials:

| Knob | Default | Floor | Notes |
|---|---|---|---|
| `event_pause_ms` | 10ms | 7ms (AVD) / 5ms (local) | Primary speed knob. Sleeps after every key down/up. Below floor, shift state latches stuck-on. |
| `mod_hold_ms` | 10ms | untested below 10ms with Q12 | Sleep between shift-down and char-down (and char-up and shift-up). Tied to the cliclick recipe. |
| `warmup_shift` | true | — | See Q3. Boolean toggle. |
| `COUNTDOWN_SECS` | 3s | — | Pre-send countdown. UX preference, not a reliability dial. |

Hardcoded:
- Source state = `Private` (Q12 — never expose; switching to Combined re-introduces the bug)
- Tap = `Session` (Q12)
- Event shape = cliclick sandwich (Q2)

Removed:
- `char_pause_ms` (poc2 sweep showed no effect; default was 0)
- `jitter_ms` (PoC anti-detection vestige, irrelevant for AVD)
- `MAX_LINE_CHARS` (Q8 retired; without OCR there is no horizontal-scroll concern)
- `CHUNK_SIZE_LINES`, `CHUNK_VERIFY_SETTLE_MS`, `SCROLL_*`, `VERIFY_PASS_THRESHOLD` (all OCR-related, retired)

**Source:** [`docs/poc2-results.md`](poc2-results.md) speed sweep.

### Q14 — Three control verbs: send, pause, stop. Resume is "send from offset"

**Status:** active in v2.

**Decision:** The send loop responds to a tri-state control flag — `running` / `pause_requested` / `stop_requested`. The frontend exposes three control verbs; Resume is not a separate command:

- **Send** — invoke `run_send(start_offset=0)`. Initial run from the beginning.
- **Pause** — invoke `pause_send()`. The loop halts at the next char boundary, holds position, emits `send-paused {position}`.
- **Resume** — invoke `run_send(start_offset=paused_position)`. Re-runs the same flow starting from the held position. UX-wise it's a separate button, mechanically it's just `run_send` with an offset.
- **Stop** — invoke `stop_send()`. The loop halts, position resets to 0, emits `send-stopped {position}`. Next Send starts from the beginning.

Both Send and Resume re-run the `COUNTDOWN_SECS` countdown so the user can re-focus the AVD window before typing resumes. The countdown overlay covers the whole window during this period.

**Why three verbs, not two:**

- **Pause vs Stop are different intents.** Pause = "I need to do something else for a moment, pick up where you left off." Stop = "abandon this run, start over if I want to retry." A single combined verb would silently lose user intent.
- **Resume must re-run the countdown** because the user's AVD focus may have drifted while paused. A countdown-less resume would frequently mis-fire keystrokes into the wrong window.
- **Resume not separate command** because the backend mechanism is identical to Send — the only difference is `start_offset`. Two commands doing the same thing would invite divergence over time.

**Why not "pause = stop with resume"** (i.e. always start from beginning, ask the user "type all 15k chars again from char 0?"): for long runs (15k chars at 25 ch/s = 10 min) this wastes the user's time when their pause was a 30-second interruption. Resume-from-position is a major UX win.

**Backend implementation note:** the cancel mechanism in `typer-core` becomes a `SendControl` enum (`Running` / `PauseRequested` / `StopRequested`) wrapped in `Arc<Mutex<>>` (or `AtomicU8` with a tiny mapping). The send loop checks at every char boundary. Existing `stop_send` semantics from v1 generalize cleanly.

**Source:** new in v2.

## Build phases (v2 rewrite)

The v1 phases (1–6 + Phase 2.5) are retired. v2 phases below; see `docs/progress.md` for the live task list.

- **Phase v2-0 — poc2 complete.** Keystroke-injection method survey, AVD validation, speed-floor characterization. Captured in [`docs/poc2-results.md`](poc2-results.md). ✅ done.
- **Phase v2-1 — Apply the Q12 fix in shipped code.** One-line change in `typer-core/src/event_source.rs::session_default()`. Run `cargo test --workspace` (still 140/140), re-run a short live-AVD smoke against the new binary to confirm the fix in the shipping pipeline. Then we're free to start removing the OCR layer.
- **Phase v2-2 — Strip OCR + chunking from `typer-core/`, add Q14 control model.** Remove `ocr.rs`, `verify.rs`, `align.rs`, `fold.rs`, `stitch.rs`, `scroll.rs`. Simplify `sender.rs` to drop `send_chunk` (we keep `run_send`). Replace the v1 `AtomicBool` cancel flag with a `SendControl` tri-state (`Running` / `PauseRequested` / `StopRequested`) per Q14. Add `start_offset` parameter to `run_send` for resume. Remove the OCR-related constants from `config.rs`. Remove the Swift `ocr_helper` sidecar source + binary. Update tests.
- **Phase v2-3 — Strip OCR + chunking from `src-tauri/`, add pause/resume.** Remove `verify_visible`, `scroll_verify`, `calibrate`, `get_region`, `clear_region`, `check_lines`, `send_with_chunked_verify`, `continue_after_fail`. Replace v1 `stop_send` with the tri-verb surface from Q14: `run_send(text, cfg, start_offset)`, `pause_send()`, `stop_send()`. Add `get_settings` / `save_settings` for Q13. Remove the `region_picker` sidecar + capability entries. Update Tauri capabilities allowlist (narrower).
- **Phase v2-4 — Rewrite the frontend for the locked v2 UI (see "Frontend layout" + Q14).** Two-gate status strip (Text + Accessibility); status strip switches to a progress line during send/pause. Edit/Lock toggle on the text panel. Active-line indicator (subtle blue left-border) updated from `send-progress`. Bottom controls: Send/Pause/Resume single button, Stop button, Settings cog, Edit/Lock toggle. Countdown overlay fires on Send AND Resume. Esc bound to Pause-or-Stop based on current state. Remove the per-chunk visual states, fail-diff renderer, Skip/Stop/Continue UX, region indicator, lines indicator from v1.
- **Phase v2-5 — Settings pane (Q13).** Four dials surfaced. Persisted to `<app_data_dir>/settings.json`. Defaults reset button.
- **Phase v2-6 — Polish + ship.** Visual identity, keyboard shortcuts, "About" surfacing the Q12 fix and AVD-tested speed defaults.

## Future work (deferred from v2)

- **Cross-platform.** Linux (`ydotool` / `xdotool`) and Windows (`SendInput`). Each is a separate research round; method behavior on those platforms is unknown.
- **Auto-correction.** v1's Q11 work (Shift+Up × N + Backspace as a delete primitive) was validated on AVD. If v2's "type and stop" model ever needs a verify mode again — e.g. for higher-error environments like Citrix or VMware Horizon — the delete primitive is ready to slot in.
- **Re-test other RDP/VDI clients.** All v2 validation was Microsoft Windows App on AVD. Citrix, VMware Horizon, Parallels Client, etc. may behave differently.
- **Per-VM speed profile.** Settings pane (Q13) has the dials; a future enhancement could let users save named profiles ("AVD slow", "Citrix fast", etc.) and pick at send time.
