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
| 7 | Extract sender / verify / scroll / LCS / fold / stitch from [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) into `typer-core/` crate. Keep PoC functions (`run_send`, `run_scroll_verify`) intact for whole-file mode. Replace `process::exit` / `eprintln!` with `Result<_, Error>` returns (thiserror) and `log::*` calls — libraries can't exit. | not started |
| 8 | Add `send_chunk(lines: &[&str])` + `verify_visible(expected: &[&str]) -> DiffStats` (new pair for Q7/Q9 chunked loop). Reuses `send_char`, `capture_ocr_lines`, `print_diff` from extracted code. | not started |
| 9 | Centralise all numeric defaults in `typer-core/src/config.rs` as named `const`s (CHUNK_SIZE_LINES=5, MAX_LINE_CHARS=80, COUNTDOWN_SECS=3, EVENT_PAUSE_MS=10, MOD_HOLD_MS=10, SCROLL_SETTLE_MS=250, VERIFY_PASS_THRESHOLD=0). | not started |
| 10 | Keep a thin CLI shim in `typer-core/src/bin/typer.rs` for local testing (preserves all PoC subcommands). | not started |
| 11 | Copy Swift sidecar sources from [`docs/poc/ocr_helper/`](poc/ocr_helper/) to `src-tauri/binaries/src/` and compile binaries into `src-tauri/binaries/`. | not started |
| 12 | Introduce an `EventSource` trait so sender logic is testable without posting real CGEvents — production impl wraps `core-graphics`, test impl records calls. Required by tasks 15–17. | not started |
| 13 | **Unit: keymap coverage.** `char_to_keycode` returns Some for every printable ASCII char in the sample corpus. Inline `#[cfg(test)]` in `typer-core/src/keymap.rs`. | not started |
| 14 | **Unit: fold table.** `fold_char` maps each documented confusion class (`` ` `` ↔ `'`, `<` ↔ `‹`, etc.) to a single canonical char. One assertion per class. | not started |
| 15 | **Unit: LCS alignment.** Given `sent_lines` and `seen_lines` derived from [`stress1_ocr.json`](poc/results/stress1_ocr.json), `align_lines` returns the expected aligned pairs with correct `OCR_DROP`/`OCR_XTRA` positions. Covers `rules/testing.md` invariant #4. | not started |
| 16 | **Unit: chunk stitching.** Three overlapping OCR chunks from the sample corpus stitch to the expected 58-line result. Covers `rules/testing.md` invariant #3. | not started |
| 17 | **Integration: regression fixture.** Keystroke expectations for [`docs/poc/samples/code_corpus.txt`](poc/samples/code_corpus.txt) (0 skipped, 0 typing errors). `typer-core` emits expected keystroke sequence via the trait-mocked event source; diffed against committed fixture under `tests/fixtures/`. Covers `rules/testing.md` invariant #1. | not started |
| 18 | **Integration: shift warmup regression.** Toggles `warmup_shift`; proves the keystroke sequence differs and that removing warmup would cause the first-shifted-char drop documented in PoC. Covers `rules/testing.md` invariant #2. | not started |
| 19 | **Integration: chunked verify pair.** `send_chunk` + `verify_visible` against a synthetic 10-line fixture; asserts pass on clean OCR JSON and fail with expected char_diffs on a one-char-corrupted OCR JSON. | not started |

## Phase 2.5 — Delete-primitive PoC

Unblocks v2 auto-retry (Q10, currently deferred). v1 ships without auto-rollback; this proves which delete strategy is safe to add later.

| # | Task | Status |
|---|---|---|
| 20 | New CLI subcommand `typer delete-test` mirroring PoC `scroll-test` shape: types a known 5-line block, then fires each candidate delete strategy with announce-pause between attempts. User watches AVD and reports which strategies cleanly removed the block. | not started |
| 21 | Candidates to probe: (a) Backspace × N chars, (b) Ctrl+Z once, (c) Ctrl+Z × 5, (d) Shift+Up × 5 + Backspace, (e) Shift+Up × 5 + Delete-key (keycode 117, Forward Delete). | not started |
| 22 | Document outcome in `docs/lessons.md` (which strategies reach AVD, which don't), append decision Q11 to `design-plan.md` locking the chosen strategy for v2. | not started |

## Phase 3 — Tauri commands

| # | Task | Status |
|---|---|---|
| 23 | `calibrate` command — spawns `region_picker` sidecar, validates returned region, persists to app data dir. | not started |
| 24 | `get_region` / `clear_region` commands for UI state. | not started |
| 25 | `check_lines(text)` command — returns `{ ok: bool, offending: [{line: int, length: int}] }` for Q8 pre-check. Pure function, no side effects. | not started |
| 26 | `send_with_chunked_verify(text)` command — drives the Q7+Q9 loop. Emits `chunk-start {index, lines}`, `chunk-pass {index}`, `chunk-fail {index, diff}`, `send-complete {summary}` events. Awaits frontend `continue-after-fail` ack on chunk fail (Q10). | not started |
| 27 | `verify_visible` command (single-region OCR + diff) and `scroll_verify` command (full-file PoC mode, debug). | not started |
| 28 | `stop_send` command — cooperative cancel via shared atomic flag in `typer-core`. | not started |
| 29 | Validate all command arguments per `rules/security.md` — no arbitrary file paths from frontend, OCR JSON parsed via typed serde, capabilities allowlist narrow. | not started |
| 30 | **Unit: command handlers.** Each Tauri command is callable as a plain async Rust function (per `rules/testing.md`: no full Tauri app spin-up). Test arg validation (invalid paths rejected, malformed OCR JSON returns typed error), the chunked-verify state machine against a stub `EventSource`, and the stop-flag cancels mid-loop. | not started |
| 31 | **Integration: Tauri command smoke in CI.** `cargo test -p src-tauri` invokes each command via its exported fn with in-memory deps. Runs in the existing macos-latest CI job. | not started |

## Phase 4 — v1 UI

Single-window layout. The text panel dominates; controls and status sit around it. No design polish yet (Phase 5).

| # | Task | Status |
|---|---|---|
| 32 | Layout skeleton — single window (min 900×700), three regions: top status/gate strip (~60px), center text panel (fills available space), bottom controls (~80px). Tailwind utilities only, no custom CSS. Empty placeholders in each region. | not started |
| 33 | Text input surface — single panel-as-textarea: pre-load shows "Paste text or click Load File" placeholder + editable; on submit (or file load) flips to immutable read-only mode. "Load file" button uses Tauri dialog plugin. | not started |
| 34 | Pre-task gate strip — four indicators left-to-right (text ✓ / line check ✓ / region ✓ / permissions ✓). Each ✗ is clickable and triggers its remediation. Send button (in bottom controls) disabled unless all four ✓. | not started |
| 35 | Calibrate flow — gate-strip region indicator click → invokes `calibrate` → region_picker overlay → drag → returned region persists → indicator flips to ✓ with badge "Region 1707×922". Hover badge shows full coords (x,y,w,h). | not started |
| 36 | Line-length check (Q8) — on text load, runs `check_lines`. If any line >MAX_LINE_CHARS, indicator shows ✗ + count ("3 lines too long"). Click expands inline list ("Line 12: 137 chars · ..."). Offending lines also get red left-border in the text panel. Re-runs on reload. | not started |
| 37 | Immutable text panel with per-chunk states — scrollable monospace, with line numbers in a left gutter. Lines visually grouped into chunks of CHUNK_SIZE_LINES (subtle divider every 5 lines). Each chunk in one of: untouched (gray), in-progress (blue left-border + light blue bg), pass (green left-border), fail (red left-border, click-to-expand). Initial state: all untouched. | not started |
| 38 | Countdown overlay — fullscreen overlay during pre-send N-second window, large numerals ("3 → 2 → 1 → GO"), instructional text ("Click into the AVD window now"), visible Cancel button. Esc also cancels. Dismisses automatically when first keystroke fires. | not started |
| 39 | Live progress wiring — subscribe to `chunk-start` / `chunk-pass` / `chunk-fail` via `listenTauriEvent`, drive panel state. Bottom controls show "Chunk 3 / 24 · 12% done". Auto-scroll panel only when in-progress chunk is about to leave view (not always center). | not started |
| 40 | Fail handling UI (Q10) — on `chunk-fail`, send loop pauses (backend awaits ack). Failed chunk expands inline showing diff (sent vs seen, char-level highlight on mismatches). Three buttons: **Skip** (`continue-after-fail {action: 'skip'}` → mark failed-acked, advance), **Stop** (`stop_send`), **Continue** (`{action: 'retry-from-here'}` → backend re-runs `verify_visible` on the same chunk after user has fixed AVD; if pass, advance; if still fail, same three buttons reappear). Tooltip on Continue explains the re-verify-same-chunk semantics. | not started |
| 41 | Stop control — button in bottom controls (visible during send) + Esc hotkey. Invokes `stop_send`. Stopped state: current chunk shown yellow left-border + "stopped" badge; remaining chunks revert to untouched. Top status: "Stopped at chunk 7 / 24." v1: no resume — must restart from chunk 1 (auto-rollback in Phase 6). | not started |
| 42 | Permission gating — indicator shows ✓ if Accessibility AND Screen Recording granted, ✗ otherwise. Click ✗ → modal explaining what's needed + "Open System Settings" button (deep-link via `open` crate). Re-checks on app focus (visibilitychange). **Spike risk:** Tauri 2 may not have a built-in macOS permission probe; if not, build a small Swift probe sidecar in Phase 3. Try Tauri builtins first. | not started |
| 43 | Persistence — last-loaded text and saved region survive app relaunch, stored as JSON in Tauri's `path::app_data_dir`. Region already persisted by task 23; this adds text persistence. On launch, restore both into UI state. "Clear" button wipes both (top-right of gate strip). Persistence of user-initiated content is OK; **logging** of sent content is not (`rules/security.md` distinction). | not started |
| 44 | **Unit: pure core modules.** Tests for `src/lib/core/` helpers (diff rendering, line-length checker, chunk grouping by CHUNK_SIZE_LINES, fold table mirror). Colocated `.test.ts` files. Pure — no mocks needed. | not started |
| 45 | **Unit: React components.** Vitest + Testing Library for gate strip (gate states render correctly), text panel (chunk state classes applied), countdown overlay (Esc cancels), fail-handling panel (three buttons render with correct actions). Mock `@/lib/ipc` at module boundary. | not started |
| 46 | **Integration: chunk state machine.** Mock `@/lib/ipc` to emit a scripted sequence of `chunk-start` / `chunk-pass` / `chunk-fail` / `send-complete` events. Assert text panel transitions match expected state at each step, including a pause-for-fail flow and a Skip-then-continue flow. No Tauri runtime needed. | not started |
| 47 | **E2E: live-AVD smoke.** Types the locked `code_corpus.txt` sample, achieves PoC's 98.30%+ aggregate accuracy with **0 chunk failures**. `KEYSTREAM_LIVE_VM=1 pnpm tauri:dev`, captures saved to `sandbox/` (gitignored). Result + date documented in `docs/lessons.md`. Manual run; gated out of CI. | not started |

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

- PoC CLI (at [`docs/poc/typer/`](poc/typer/)) — 0 typing errors over 9,160 chars, 5-run stress test against a real remote VM, 98.30–98.37% char accuracy after OCR fold. Swift sidecar sources at [`docs/poc/ocr_helper/`](poc/ocr_helper/). Sample corpus [`docs/poc/samples/code_corpus.txt`](poc/samples/code_corpus.txt). Stress-run capture [`docs/poc/results/stress1_*`](poc/results/). Full lineage including the Python predecessor documented in [`docs/poc/README.md`](poc/README.md).
- Tauri + Next.js scaffold builds cleanly (`pnpm install`, structure in place).
- Universal infra ported from teacherease: JSON file logger writing to app data dir, 4 log Tauri commands (`log_info/warn/error/open_log_dir`), `src/lib/ipc.ts` facade with `listenTauriEvent` + log wrappers, `tsconfig` with `noUncheckedIndexedAccess`, vitest config, `pnpm bump` version script, GitHub Actions CI (TS + Rust).
- `pnpm check` (lint + typecheck + test) and `cargo clippy -- -D warnings` + `cargo fmt --check` + `cargo test` all pass.
- v1 UX shape locked. Decisions Q7–Q10 in `design-plan.md` capture chunk size (5 source lines), pre-send line-length check (≤80), per-chunk verify (0 char diffs after fold), and the v1 "pause-and-surface, no auto-rollback" failure model.
- Cargo workspace in place (workspace root `Cargo.toml` + `src-tauri` + empty `typer-core`). Shared deps (`serde`, `serde_json`, `log`, `thiserror`) declared in `[workspace.dependencies]`. Single `Cargo.lock` at workspace root. `cargo fmt --check` + `cargo clippy --workspace --all-targets -- -D warnings` + `cargo test --workspace` all pass.

## What's Next

Phase 2 — task 7: extract sender / verify / scroll / LCS / fold / stitch from [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) into the now-empty `typer-core/` crate. Replace PoC's `process::exit` / `eprintln!` with `Result<_, thiserror::Error>` returns and `log::*` calls.
