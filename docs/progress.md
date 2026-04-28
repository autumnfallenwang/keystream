# Progress

Live task tracker. Update via `/update-progress` after finishing work. The "why" behind each phase lives in `docs/design-plan.md`.

## v1 retrospective (preserved for context)

v1 (Phases 1–4 + Phase 2.5) shipped a per-chunk OCR-verify architecture with 16 Tauri commands, a four-gate UI, and a fail-and-retry handshake. The live-AVD smoke (task 47) surfaced intermittent shift-drops, which led to the [poc2 keystroke-injection study](poc2-results.md). poc2 found that switching the CGEvent source state to `Private` eliminates the bug entirely — at byte-perfect input reliability, OCR-verify becomes unnecessary complexity. v2 is a substantial simplification.

v1 phase summary:
- Phase 1 (scaffold), Phase 2 (split typer-core), Phase 2.5 (delete-primitive PoC), Phase 3 (16 Tauri commands), Phase 4 (UI build-out incl. tasks 32-46): all completed. Task 47 (live-AVD smoke) caught the shift-drop bug that drove poc2.
- 140 cargo tests + 78 vitest tests passing as of the v1 freeze.
- Most v1 code becomes obsolete in v2 (OCR pipeline, region calibration, chunked verify, fail-and-retry UX, region_picker sidecar). The keystroke sender stays — with the Q12 fix.

## v2 phase plan

| Phase | Task | Status | Definition of done |
|---|---|---|---|
| v2-0 | poc2 study — method survey, AVD validation, speed-floor characterization | done | poc2-results.md committed; sandwich+Private validated 0/45,051 chars on AVD |
| v2-design | UI design locked (Q12/Q13/Q14 in design-plan.md; v2-frontend-design.md) | done | both docs reviewed; aesthetic + state machine + all 7 open questions resolved |
| v2-1 | Apply Q12 fix in shipped code | done | event_source.rs::session_default uses Private; CLI routed through session_default; 140/140 still passing; clippy + fmt clean. Manual AVD smoke pending operator. |
| v2-2 | Strip OCR + chunking from `typer-core/`; add Q14 SendControl tri-state | done | OCR/verify/align/fold/stitch/scroll/region/lint/diff modules + Swift sidecars deleted; control.rs added (5 tests); sender.rs takes SendControlFlag + start_offset, returns SendOutcome; CLI slimmed to just `send` (4 tests); 24 typer-core tests passing; clippy + fmt clean. **src-tauri intentionally broken until v2-3.** |
| v2-3 | Strip OCR + chunking from `src-tauri/`; add pause/resume commands | done | calibrate/lint/verify modules deleted; settings.rs added (6 tests); send_state.rs wraps SendControlFlag; send.rs has new run_send/pause_send/stop_send + SendComplete/SendPaused/SendStopped events; permissions drops screenRecording; lib.rs + Cargo.toml + tauri.conf.json + capabilities trimmed (no shell plugin / sidecars). 68 workspace tests passing; clippy + fmt clean. **Frontend (`src/`) still uses v1 IPC; v2-4 rewrites it.** |
| v2-4 | Rewrite frontend for the locked v2 UI | done | New components: sidebar / main-header / action-bar / settings-page. Rewritten: text-panel (with active-line scanline), countdown-overlay (Fraunces ring + numeral). New pure core: app-state.ts (reducer, 13 tests), active-line.ts (6 tests). New IPC: runSend / pauseSend / stopSend / getSettings / saveSettings + SendEvent variants. v2 palette + Fraunces + JetBrains Mono via next/font. 44 vitest passing; 68 cargo passing; pnpm build clean; pnpm typecheck clean; pnpm lint clean (4 pre-existing warnings only). |
| v2-5 | Settings pane (Q13) — 4 dials + persistence | code done; operator-pending | Settings UI shipped in v2-4. v2-5 added test coverage for the 4 v2-4 components (sidebar / main-header / action-bar / settings-page); **84 vitest passing** (up from 44). Operator-side DoD items (settings-persist-across-relaunch, AVD smoke against v2 binary) are recorded under "What's Next" — they need a built app and human, not code. |
| v2-6 | Polish + ship | pending | dmg builds; first-launch on a clean Mac works; release notes drafted |

References:
- Architecture per phase: [`design-plan.md`](design-plan.md) "Build phases (v2 rewrite)" section.
- Visual design for v2-4: [`v2-frontend-design.md`](v2-frontend-design.md).
- Locked decisions: Q1, Q2, Q3, Q12, Q13, Q14 in [`design-plan.md`](design-plan.md) "Locked Decisions".

## What's Next

**v2-5 operator handoff — three manual checks before v2-6 starts.**

1. **Settings persist across app relaunch.** `pnpm tauri:build` → install Keystream.app → open Settings → change Event pause to 8ms → quit → relaunch → open Settings → confirm 8ms is still selected.
2. **Reset to defaults persists.** From the same flow: click Reset to defaults → confirm dials snap back to 10ms / 10ms / 3s / warmup ON → quit → relaunch → confirm reset persisted.
3. **First v2 AVD smoke.** With AVD/Notepad focused, load `docs/poc/samples/code_corpus.txt` (29 lines, 916 chars) → click Send → expect 0 shift-drops at the default 10ms event_pause_ms.

The first two are quick (under 2 min). The AVD smoke is the bigger commitment — after it succeeds, v2 is end-to-end validated and **Phase v2-6** (polish + ship) begins.

**SendProgress note**: `run_send` still doesn't emit mid-loop progress events. The status line in the action bar shows `Typing N chars` from the channel events but `N` doesn't tick during the run — only on completion. Real callback-driven progress is a v2-polish follow-up. Acceptable for the v2 launch since the user has the active-line scanline as the visual feedback.

---

## Phase v2-2 unpacked (typer-core: strip OCR, add Q14 SendControl)

**Files to delete:**
- `typer-core/src/ocr.rs`
- `typer-core/src/verify.rs`
- `typer-core/src/align.rs`
- `typer-core/src/fold.rs`
- `typer-core/src/stitch.rs`
- `typer-core/src/scroll.rs`
- `typer-core/src/region.rs` (region calibration is OCR-only)
- Tests inline in those modules
- `typer-core/tests/sender_regression.rs` (depends on OCR fold table — replace with a non-OCR keystroke-sequence regression that uses the existing committed fixture)

**Files to modify:**
- `typer-core/src/lib.rs` — drop the deleted module declarations and re-exports
- `typer-core/src/sender.rs` — drop `send_chunk` and `chunk_text` (no chunking in v2); keep `run_send`, `send_char`, `tap_key`, `warmup_shift`, `clear_editor`, `send_ctrl_combo`. Add `start_offset: usize` parameter to `run_send` (skip the first N chars, used for resume per Q14).
- `typer-core/src/event_source.rs` — already updated in v2-1 (Q12 fix lives here)
- `typer-core/src/config.rs` — keep `EVENT_PAUSE_MS`, `MOD_HOLD_MS`, `MOD_HOLD_MIN_MS`, `WARMUP_SETTLE_MS`, `COUNTDOWN_SECS`, `DEFAULT_WARMUP_SHIFT`, `CLEAR_EDITOR_SETTLE_MS`. Drop `CHUNK_SIZE_LINES`, `CHUNK_VERIFY_SETTLE_MS`, `MAX_LINE_CHARS`, `SCROLL_*`, `VERIFY_PASS_THRESHOLD`, `PAGE_UP_INTER_MS`.
- `typer-core/src/error.rs` — drop OCR-specific `TyperError` variants (anything with "Ocr", "Region", "Verify", "Scroll" in the name).
- `typer-core/src/bin/typer.rs` — drop the `verify`, `scroll-test`, `send-chunk`, `delete-*` subcommands. Keep `send` and `calibrate` is gone (no region). Add `pause` / `resume` only if useful for CLI smoke (probably not needed; can resume via a `--start-offset` flag on `send`).

**New: SendControl tri-state.** A new module `typer-core/src/control.rs`:
```rust
pub enum SendControl {
    Running,
    PauseRequested,
    StopRequested,
}
pub struct SendControlFlag(Arc<AtomicU8>);
// or Arc<Mutex<SendControl>> — whichever stays clean across the FFI boundary
```
Used in the `run_send` loop: at every char boundary, check the flag and break out cleanly emitting the right event.

**Sidecar:** delete `src-tauri/binaries/ocr_helper-aarch64-apple-darwin` and `src-tauri/binaries/region_picker-aarch64-apple-darwin` plus their `src/` Swift sources. Update `src-tauri/binaries/README.md` to note both are removed.

**Test count expectation:** roughly 140 → 60 (rough estimate; we lose ~30 fold/align/stitch tests, ~15 OCR/verify/scroll tests, ~20 chunked-send tests, ~5 keymap-edge tests stay, ~30 sender/event-source tests stay, plus new ~5 SendControl tests).

**Definition of done:**
- `cargo test --workspace` clean at the new lower count
- `cargo clippy --workspace --all-targets -- -D warnings` clean
- `cargo fmt --check` clean
- `typer-core` re-exports trim to only what `src-tauri` will need (sender, event source, config, control, error)

---

## Phase v2-3 unpacked (src-tauri: strip OCR, add pause/resume)

**Files / handlers to delete:**
- All v1 commands except: `read_text_file`, `save_text`, `get_text`, `clear_text`, `check_permissions`, `open_settings_pane`, `log_*`, `open_log_dir`.
- Specifically delete: `calibrate`, `get_region`, `clear_region`, `check_lines`, `verify_visible`, `scroll_verify`, `send_with_chunked_verify`, `continue_after_fail`, the v1 `stop_send`.
- Region persistence module (`persist.rs` if it splits out — or just the region keys).

**Files / handlers to add:**
- `run_send(text, cfg, start_offset)` — drives the v2 loop using `typer_core::run_send`. Emits `send-progress` (throttled, every ~100 chars), `send-paused {position}`, `send-stopped {position}`, `send-complete {chars, duration_ms, skipped}`.
- `pause_send()` — flip `SendControl` to `PauseRequested`.
- `stop_send()` — flip `SendControl` to `StopRequested`.
- `get_settings()` / `save_settings(cfg)` — read/write `<app_data_dir>/settings.json`. Schema: `{ event_pause_ms: u64, mod_hold_ms: u64, warmup_shift: bool, countdown_secs: u64 }`.
- `check_permissions()` — drop `screen_recording` field from the response (Q12 means we no longer need it).

**Tauri capabilities** (`src-tauri/capabilities/default.json`):
- Drop the file-system region path entries
- Drop dialog scopes if region_picker was using any
- Keep dialog plugin (file-load), shell plugin (System Settings deep-link), log plugin
- Result: narrower allowlist than v1

**Tests:**
- Drop integration smoke tests for the v1-only commands
- Add integration smoke tests for `run_send` / `pause_send` / `stop_send` / `get_settings` / `save_settings`

**Definition of done:**
- `cargo test -p keystream` clean
- All integration smoke tests cover the new tri-verb surface
- Capabilities allowlist diff committed alongside the command changes

---

## Phase v2-4 unpacked (frontend rewrite for the locked v2 UI)

**Design source:** [`v2-frontend-design.md`](v2-frontend-design.md). All locked answers are in the "Locked answers (2026-04-28)" section there.

**State model:** the discriminated union `AppState` in v2-frontend-design.md "State machine" — `idle | sending | paused | stopped | done | countdown | settings`.

**Pre-step:** revert the unstaged Skip/Continue countdown changes in `src/app/page.tsx` and `src/components/countdown-overlay.tsx` — those were v1 fail-and-retry plumbing that has no place in v2.

**Implementation order** (matches the design doc's plan):
1. Theme tokens + fonts (`globals.css`, `layout.tsx`, Tailwind 4 `@theme`)
2. Sidebar component
3. Main header (gates + Edit/Lock segmented switch)
4. Text panel (gutter + content + active-line scanline)
5. Action bar (status line + primary/secondary buttons)
6. Countdown overlay (Fraunces numeral + ring)
7. Settings page (sliders + checkboxes)
8. `page.tsx` recomposition with the new state machine
9. Test rewrite: drop v1 chunk/diff/fail tests; add v2 tests for action-bar state transitions, countdown timing, settings persistence, gate logic

**IPC adapter note (transitional):** during v2-4 the `src-tauri/` may still be on v1 commands if v2-3 hasn't merged yet. If so, build a thin `lib/ipc-v2.ts` adapter that maps v1 events → v2 state transitions for development; swap to the v2 commands once v2-3 lands. If v2-3 ships before v2-4 starts, no adapter needed.

**Definition of done:**
- `pnpm typecheck` / `pnpm lint` clean
- `pnpm test` covers the new state machine
- `pnpm tauri:dev` boots and the UI renders
- All 7 design-doc requirements (Send/Pause/Resume button, Stop, Edit/Lock, gates, active-line indicator, countdown on Send and Resume, status line) hand-tested against the running app

---

## Phase v2-5 unpacked (settings pane)

**Backend already shipped in v2-3:** `get_settings` / `save_settings`.

**Frontend:**
- `settings-page.tsx` rendered when `AppState.mode === "settings"` (sidebar stays visible)
- Four dials per Q13 with the values + helpers from `v2-frontend-design.md` "Region 4 — Settings page"
- Persistence: debounced 300ms write on every change
- Reset to defaults button: confirm? — design says no confirm, just an immediate reset
- Helper text under each slider citing the AVD floor (7ms) and local floor (5ms) for `event_pause_ms`

**Definition of done:**
- Settings persist across app relaunch
- Reset button restores Q13 defaults
- All four dials reach their intended ranges and the current value renders in mono with units
- `<app_data_dir>/settings.json` schema matches the v2-3 backend

---

## Phase v2-6 unpacked (polish + ship)

**Visual:**
- Empty-text-panel "Drop a file here, or click to load" state (drag-drop is bonus; click-to-focus is required)
- Hover affordances on all rail items
- Focus rings on Tab navigation through controls

**Keyboard shortcuts:**
- ⌘O — Load file
- ⌘L — Toggle Edit/Lock
- ⌘, — Open Settings
- Enter — Send (when idle, gates pass)
- Esc — Pause (during sending) or Stop (during paused) or Cancel countdown

**Build & ship:**
- `pnpm tauri:build` produces a signed-or-unsigned dmg (v1 was unsigned, v2 follows)
- Re-run live-AVD smoke against the dmg-installed binary
- Update `README.md` first-launch instructions for Accessibility-only permission grant
- Draft release notes — header is "v2: byte-perfect typing, no OCR"

**Definition of done:**
- dmg builds clean
- Fresh-Mac install workflow documented (Accessibility grant, the unsigned-Gatekeeper warning)
- Release notes ready to publish

---

## Pre-existing work uncommitted

`src/app/page.tsx` and `src/components/countdown-overlay.tsx` carry leftover Skip/Continue UX changes from a prior session. They're v1 plumbing for the fail-and-retry handshake — entirely obsolete in v2-4. **Revert these before starting v2-4.** Don't commit them.
