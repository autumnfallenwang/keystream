# Progress

Live task tracker. Update via `/update-progress` after finishing work. The "why" behind each phase lives in `docs/design-plan.md`.

## Phase 1 — Scaffold

| # | Task | Status |
|---|---|---|
| 1 | Create `keystream/` repo, scaffold Next.js 16 + Tauri 2 + TypeScript + Tailwind 4 | done |
| 2 | Inherit tooling from teacherease (biome, vitest, CLAUDE.md, .claude, .gitignore, LICENSE, README) | done |
| 3 | Seed `docs/design-plan.md` and `docs/progress.md` with PoC decisions | done |
| 4 | Inherit universal infra — JSON logger, ipc facade, bump-version script, CI workflow, smoke test | done |
| 5 | First commit (initial scaffold) | done |

## Phase 2 — Split typer-core

| # | Task | Status |
|---|---|---|
| 6 | Convert repo to a Cargo workspace with `typer-core/` and `src-tauri/` as members. | done |
| 7 | Extract sender / verify / scroll / LCS / fold / stitch from [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) into `typer-core/` crate. Keep PoC functions (`run_send`, `run_scroll_verify`) intact for whole-file mode. Replace `process::exit` / `eprintln!` with `Result<_, Error>` returns (thiserror) and `log::*` calls — libraries can't exit. | done |
| 8 | Add `send_chunk(lines: &[&str])` + `verify_visible(expected: &[&str]) -> DiffStats` (new pair for Q7/Q9 chunked loop). Reuses `send_char`, `capture_ocr_lines`, `print_diff` from extracted code. | done |
| 9 | Centralise all numeric defaults in `typer-core/src/config.rs` as named `const`s (CHUNK_SIZE_LINES=5, MAX_LINE_CHARS=80, COUNTDOWN_SECS=3, EVENT_PAUSE_MS=10, MOD_HOLD_MS=10, SCROLL_SETTLE_MS=250, VERIFY_PASS_THRESHOLD=0). | done |
| 10 | Keep a thin CLI shim in `typer-core/src/bin/typer.rs` for local testing (preserves all PoC subcommands). | done |
| 11 | Copy Swift sidecar sources from [`docs/poc/ocr_helper/`](poc/ocr_helper/) to `src-tauri/binaries/src/` and compile binaries into `src-tauri/binaries/`. | done |
| 12 | Introduce an `EventSource` trait so sender logic is testable without posting real CGEvents — production impl wraps `core-graphics`, test impl records calls. Required by tasks 15–17. | done (pulled forward into task 7) |
| 13 | **Unit: keymap coverage.** `char_to_keycode` returns Some for every printable ASCII char in the sample corpus. Inline `#[cfg(test)]` in `typer-core/src/keymap.rs`. | done |
| 14 | **Unit: fold table.** `fold_char` maps each documented confusion class (`` ` `` ↔ `'`, `<` ↔ `‹`, etc.) to a single canonical char. One assertion per class. | done |
| 15 | **Unit: LCS alignment.** Given `sent_lines` and `seen_lines` derived from [`stress1_ocr.json`](poc/results/stress1_ocr.json), `align_lines` returns the expected aligned pairs with correct `OCR_DROP`/`OCR_XTRA` positions. Covers `rules/testing.md` invariant #4. | done |
| 16 | **Unit: chunk stitching.** Three overlapping OCR chunks from the sample corpus stitch to the expected 58-line result. Covers `rules/testing.md` invariant #3. | done |
| 17 | **Integration: regression fixture.** Keystroke expectations for [`docs/poc/samples/code_corpus.txt`](poc/samples/code_corpus.txt) (0 skipped, 0 typing errors). `typer-core` emits expected keystroke sequence via the trait-mocked event source; diffed against committed fixture under `tests/fixtures/`. Covers `rules/testing.md` invariant #1. | done |
| 18 | **Integration: shift warmup regression.** Toggles `warmup_shift`; proves the keystroke sequence differs and that removing warmup would cause the first-shifted-char drop documented in PoC. Covers `rules/testing.md` invariant #2. | done |
| 19 | **Integration: chunked verify pair.** `send_chunk` + `verify_visible` against a synthetic 10-line fixture; asserts pass on clean OCR JSON and fail with expected char_diffs on a one-char-corrupted OCR JSON. | done |

## Phase 2.5 — Delete-primitive PoC

Unblocks v2 auto-retry (Q10, currently deferred). v1 ships without auto-rollback; this proves which delete strategy is safe to add later.

| # | Task | Status |
|---|---|---|
| 20 | New CLI subcommand `typer delete-test` mirroring PoC `scroll-test` shape: types a known 5-line block, then fires each candidate delete strategy with announce-pause between attempts. User watches AVD and reports which strategies cleanly removed the block. | done |
| 21 | Candidates to probe: (a) Backspace × N chars, (b) Ctrl+Z once, (c) Ctrl+Z × 5, (d) Shift+Up × 5 + Backspace, (e) Shift+Up × 5 + Delete-key (keycode 117, Forward Delete). | done |
| 22 | Document outcome in `docs/lessons.md` (which strategies reach AVD, which don't), append decision Q11 to `design-plan.md` locking the chosen strategy for v2. | done |

## Phase 3 — Tauri commands

| # | Task | Status |
|---|---|---|
| 23 | `calibrate` command — spawns `region_picker` sidecar, validates returned region, persists to app data dir. | done |
| 24 | `get_region` / `clear_region` commands for UI state. | done |
| 25 | `check_lines(text)` command — returns `{ ok: bool, offending: [{line: int, length: int}] }` for Q8 pre-check. Pure function, no side effects. | done |
| 26 | `send_with_chunked_verify(text)` command — drives the Q7+Q9 loop. Emits `chunk-start {index, lines}`, `chunk-pass {index}`, `chunk-fail {index, diff}`, `send-complete {summary}` events. Awaits frontend `continue-after-fail` ack on chunk fail (Q10). | done |
| 27 | `verify_visible` command (single-region OCR + diff) and `scroll_verify` command (full-file PoC mode, debug). | done |
| 28 | `stop_send` command — cooperative cancel via shared atomic flag in `typer-core`. | done |
| 29 | Validate all command arguments per `rules/security.md` — no arbitrary file paths from frontend, OCR JSON parsed via typed serde, capabilities allowlist narrow. | done |
| 30 | **Unit: command handlers.** Each Tauri command is callable as a plain async Rust function (per `rules/testing.md`: no full Tauri app spin-up). Test arg validation (invalid paths rejected, malformed OCR JSON returns typed error), the chunked-verify state machine against a stub `EventSource`, and the stop-flag cancels mid-loop. | done |
| 31 | **Integration: Tauri command smoke in CI.** `cargo test -p src-tauri` invokes each command via its exported fn with in-memory deps. Runs in the existing macos-latest CI job. | done |

## Phase 4 — v1 UI

Single-window layout. The text panel dominates; controls and status sit around it. No design polish yet (Phase 5).

| # | Task | Status |
|---|---|---|
| 32 | Layout skeleton — single window (min 900×700), three regions: top status/gate strip (~60px), center text panel (fills available space), bottom controls (~80px). Tailwind utilities only, no custom CSS. Empty placeholders in each region. | done |
| 33 | Text input surface — single panel-as-textarea: pre-load shows "Paste text or click Load File" placeholder + editable; on submit (or file load) flips to immutable read-only mode. "Load file" button uses Tauri dialog plugin. | done |
| 34 | Pre-task gate strip — four indicators left-to-right (text ✓ / line check ✓ / region ✓ / permissions ✓). Each ✗ is clickable and triggers its remediation. Send button (in bottom controls) disabled unless all four ✓. | done |
| 35 | Calibrate flow — gate-strip region indicator click → invokes `calibrate` → region_picker overlay → drag → returned region persists → indicator flips to ✓ with badge "Region 1707×922". Hover badge shows full coords (x,y,w,h). | done |
| 36 | Line-length check (Q8) — on text load, runs `check_lines`. If any line >MAX_LINE_CHARS, indicator shows ✗ + count ("3 lines too long"). Click expands inline list ("Line 12: 137 chars · ..."). Offending lines also get red left-border in the text panel. Re-runs on reload. | done |
| 37 | Immutable text panel with per-chunk states — scrollable monospace, with line numbers in a left gutter. Lines visually grouped into chunks of CHUNK_SIZE_LINES (subtle divider every 5 lines). Each chunk in one of: untouched (gray), in-progress (blue left-border + light blue bg), pass (green left-border), fail (red left-border, click-to-expand). Initial state: all untouched. | done |
| 38 | Countdown overlay — fullscreen overlay during pre-send N-second window, large numerals ("3 → 2 → 1 → GO"), instructional text ("Click into the AVD window now"), visible Cancel button. Esc also cancels. Dismisses automatically when first keystroke fires. | done |
| 39 | Live progress wiring — subscribe to `chunk-start` / `chunk-pass` / `chunk-fail` via `listenTauriEvent`, drive panel state. Bottom controls show "Chunk 3 / 24 · 12% done". Auto-scroll panel only when in-progress chunk is about to leave view (not always center). | done |
| 40 | Fail handling UI (Q10) — on `chunk-fail`, send loop pauses (backend awaits ack). Failed chunk expands inline showing diff (sent vs seen, char-level highlight on mismatches). Three buttons: **Skip** (`continue-after-fail {action: 'skip'}` → mark failed-acked, advance), **Stop** (`stop_send`), **Continue** (`{action: 'retry-from-here'}` → backend re-runs `verify_visible` on the same chunk after user has fixed AVD; if pass, advance; if still fail, same three buttons reappear). Tooltip on Continue explains the re-verify-same-chunk semantics. | done |
| 41 | Stop control — button in bottom controls (visible during send) + Esc hotkey. Invokes `stop_send`. Stopped state: current chunk shown yellow left-border + "stopped" badge; remaining chunks revert to untouched. Top status: "Stopped at chunk 7 / 24." v1: no resume — must restart from chunk 1 (auto-rollback in Phase 6). | done |
| 42 | Permission gating — indicator shows ✓ if Accessibility AND Screen Recording granted, ✗ otherwise. Click ✗ → modal explaining what's needed + "Open System Settings" button (deep-link via `open` crate). Re-checks on app focus (visibilitychange). **Spike risk:** Tauri 2 may not have a built-in macOS permission probe; if not, build a small Swift probe sidecar in Phase 3. Try Tauri builtins first. | done |
| 43 | Persistence — last-loaded text and saved region survive app relaunch, stored as JSON in Tauri's `path::app_data_dir`. Region already persisted by task 23; this adds text persistence. On launch, restore both into UI state. "Clear" button wipes both (top-right of gate strip). Persistence of user-initiated content is OK; **logging** of sent content is not (`rules/security.md` distinction). | done |
| 44 | **Unit: pure core modules.** Tests for `src/lib/core/` helpers (diff rendering, line-length checker, chunk grouping by CHUNK_SIZE_LINES, fold table mirror). Colocated `.test.ts` files. Pure — no mocks needed. | done |
| 45 | **Unit: React components.** Vitest + Testing Library for gate strip (gate states render correctly), text panel (chunk state classes applied), countdown overlay (Esc cancels), fail-handling panel (three buttons render with correct actions). Mock `@/lib/ipc` at module boundary. | done |
| 46 | **Integration: chunk state machine.** Mock `@/lib/ipc` to emit a scripted sequence of `chunk-start` / `chunk-pass` / `chunk-fail` / `send-complete` events. Assert text panel transitions match expected state at each step, including a pause-for-fail flow and a Skip-then-continue flow. No Tauri runtime needed. | done |
| 47 | **E2E: live-AVD smoke.** Types the locked `code_corpus.txt` sample, achieves PoC's 98.30%+ aggregate accuracy with **0 chunk failures**. `KEYSTREAM_LIVE_VM=1 pnpm tauri:dev`, captures saved to `sandbox/` (gitignored). Result + date documented in `docs/lessons.md`. Manual run; gated out of CI. | runbook ready (operator run pending) |

## Phase 5 — UI polish

Deferred until v1 is functionally complete. Frontend-design pass, keyboard shortcuts, settings surface.

## Phase 6 — Stretch

Auto-rollback retry (depends on Phase 2.5 result), auto-wrap long lines, multi-profile config, cross-platform scaffolding.

## Testing strategy at a glance

| Layer | Unit | Integration | E2E |
|---|---|---|---|
| `typer-core` (Rust) | 13–16 (keymap, fold, LCS, stitch) | 17–19 (regression fixture, shift warmup, chunk verify pair) | — |
| Tauri commands (Rust) | 30 (command-as-async-fn) | 31 (cargo test in CI) | — |
| Pure TS core (`src/lib/core/`) | 44 | — | — |
| React components | 45 | 46 (chunk state machine with mocked ipc) | — |
| Full app | — | — | 47 (live AVD, `KEYSTREAM_LIVE_VM=1`, manual) |

Every regression invariant from `rules/testing.md` has an explicit task: sender accuracy → 17, shift warmup → 18, chunk stitching → 16, LCS drops → 15.

## What's Working

**Status as of task 46**: Phase 4 build-out complete; sign-off blocked on operator running the live-AVD smoke (task 47).

- **Backend** (`src-tauri/` + `typer-core/`): full v1 IPC surface shipped — `calibrate` / `get_region` / `clear_region` / `check_lines` / `read_text_file` / `save_text` / `get_text` / `clear_text` / `send_with_chunked_verify` / `continue_after_fail` / `stop_send` / `verify_visible` / `scroll_verify` / `check_permissions` / `open_settings_pane` / `log_{info,warn,error}` / `open_log_dir`. Chunked send-and-verify drives the Q7/Q9 loop via `Channel<SendEvent>` + `tokio::sync::mpsc` ack. Q10 fail-await with Skip/Stop/Retry. Cooperative cancel via atomic flag. All command args validated (`MAX_TEXT_BYTES = 1 MiB`). Permissions probed via FFI to `AXIsProcessTrusted` + `CGPreflightScreenCaptureAccess`. Persistence at `<app_data_dir>/{region,text}.txt`. **140 cargo tests passing** (workspace `cargo fmt --check` / `clippy --workspace -- -D warnings` / `test --workspace` clean).

- **Frontend** (`src/`): four-region layout (status strip / drawers / text panel / controls) with Tailwind 4. All four gates wired (Text + Lines + Region + Permissions); Send/Stop/Esc fully behaved. Pre-send 3s countdown overlay; per-chunk visual states (untouched/inProgress/pass/fail/stopped) with line-number gutter; fail-chunk auto-expand + char-level diff renderer + Skip/Stop/Continue buttons; auto-scroll to in-progress chunk; bottom-bar progress text driven by pure helper. Persistence: text + region restore on mount; Clear button wipes both. macOS deep-link to System Settings on permission ✗. **78 vitest tests** across pure helpers (`gates` / `chunks` / `progress` / `diff-render` / `send-dispatcher`), four React component suites (`status-strip` / `text-panel` / `countdown-overlay` / `fail-diff` via happy-dom + Testing Library), and a dispatcher-driven chunk-state-machine integration test.

- **Test infrastructure**: vitest v4 with happy-dom for components; biome 2 linting clean; Next 16 static-export builds clean. `pnpm test:fast` excludes `*.integration.test.{ts,tsx}`. CI workflow disabled (early-dev decision; one-rename to re-enable). Live-VM tests gate on `KEYSTREAM_LIVE_VM=1` (documentation marker — no `.integration.test.ts` files use it yet).

- **Locked decisions** (Q1–Q11 in `design-plan.md`): keycode-only sender (Q1); cliclick shift recipe (Q2); shift warmup during countdown (Q3); Apple Vision OCR sidecar (Q4); PageUp/PageDown for scroll (Q5); LCS-based diff alignment (Q6); 5-line chunks (Q7); ≤80-char line check (Q8); 0-char-diff per-chunk pass (Q9); pause-and-surface on fail, no v1 auto-rollback (Q10); v2 auto-rollback uses Shift+Up × N + Backspace (Q11, validated by Phase 2.5 probe — all 5 candidates CLEAN against AVD + Notepad on 2026-04-24).

- **PoC baseline** (`docs/poc/`): Rust CLI shipping 0 typing errors over 9,160 chars across 5 stress runs, 98.30–98.37% aggregate accuracy after OCR fold. The `code_corpus.txt` sample + `stress1_*` capture are committed regression fixtures.

## What's Next

**Apply the v2 keystroke fix from poc2.** During the live-AVD smoke (task 47) the operator surfaced intermittent shift-drops. A round-2 PoC investigation followed; full results at [`docs/poc2-results.md`](poc2-results.md). The locked fix is a one-line change in `typer-core/src/event_source.rs::session_default()`: `CGEventSourceStateID::CombinedSessionState` → `CGEventSourceStateID::Private`. Validated 0/45,051 chars across 3×15k runs on AVD/Notepad.

Steps once we apply it:
1. Edit `typer-core/src/event_source.rs::session_default()` per above.
2. `cargo test --workspace` — should still be 140/140 (event shape unchanged).
3. `pnpm tauri:build` and re-run the live-AVD smoke against the production binary.
4. Mark task 47 done in this file.

After that, **Phase 5** (UI polish, settings surface, keyboard shortcuts) and **Phase 6** (auto-rollback retry per Q11, auto-wrap long lines, multi-profile, cross-platform) are the next plan-blocks.
