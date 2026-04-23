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
| 5 | Extract sender / verify / scroll / LCS / fold / stitch from [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) into `typer-core/` crate | not started |
| 6 | Keep a thin CLI shim in `typer-core/src/bin/typer.rs` for local testing | not started |
| 7 | Copy Swift sidecar sources from [`docs/poc/ocr_helper/`](poc/ocr_helper/) to `src-tauri/binaries/src/` and compile binaries into `src-tauri/binaries/` | not started |
| 8 | Regression fixture: keystroke expectations for [`docs/poc/samples/code_corpus.txt`](poc/samples/code_corpus.txt) (0 skipped, 0 typing errors) diffed against [`docs/poc/results/stress1_ocr.json`](poc/results/stress1_ocr.json) | not started |

## Phase 3 — Tauri commands

| # | Task | Status |
|---|---|---|
| 9 | `calibrate` command (spawns `region_picker` sidecar, saves region) | not started |
| 10 | `send` command with progress-event streaming | not started |
| 11 | `verify` command (single-viewport) and `scroll_verify` command (multi-viewport) | not started |
| 12 | `get_region` / `clear_region` for UI state | not started |
| 13 | Validate all command arguments per `rules/security.md` | not started |

## Phase 4 — Minimal UI

| # | Task | Status |
|---|---|---|
| 14 | File picker → load text | not started |
| 15 | Calibrate button | not started |
| 16 | Send + verify buttons with live progress | not started |
| 17 | Diff view (sent vs seen, OCR_DROP / OCR_XTRA markers) | not started |
| 18 | End-to-end smoke test against a remote VM matches PoC's 98.30%+ accuracy | not started |

## What's Working

- PoC CLI (at [`docs/poc/typer/`](poc/typer/)) — 0 typing errors over 9,160 chars, 5-run stress test against a real remote VM, 98.30–98.37% char accuracy after OCR fold. Swift sidecar sources at [`docs/poc/ocr_helper/`](poc/ocr_helper/). Sample corpus [`docs/poc/samples/code_corpus.txt`](poc/samples/code_corpus.txt). Stress-run capture [`docs/poc/results/stress1_*`](poc/results/). Full lineage including the Python predecessor documented in [`docs/poc/README.md`](poc/README.md).
- Tauri + Next.js scaffold builds cleanly (`pnpm install`, structure in place).
- Universal infra ported from teacherease: JSON file logger writing to app data dir, 4 log Tauri commands (`log_info/warn/error/open_log_dir`), `src/lib/ipc.ts` facade with `listenTauriEvent` + log wrappers, `tsconfig` with `noUncheckedIndexedAccess`, vitest config, `pnpm bump` version script, GitHub Actions CI (TS + Rust).
- `pnpm check` (lint + typecheck + test) and `cargo clippy -- -D warnings` + `cargo fmt --check` + `cargo test` all pass.

## What's Next

Phase 2 — task 6: extract sender / verify / scroll / LCS / fold / stitch from [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) into a new `typer-core/` library crate, with the PoC CLI kept as a thin shim at `typer-core/src/bin/typer.rs`.
