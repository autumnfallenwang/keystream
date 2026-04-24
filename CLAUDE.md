# Keystream

Desktop app that types text into virtual desktops and remote-desktop sessions via OS-level keystrokes, with OCR-based verification. Built for environments where clipboard paste is blocked. Local-only, no accounts, no cloud.

## Stack

Tauri 2 (Rust shell, native OS webview) | Next.js (App Router, static export) + React + TypeScript | Biome + Vitest | `typer-core` Rust library (keystroke sender, scroll-aware OCR verify) | Apple Vision framework (OCR, macOS only) | Swift sidecar binaries (`ocr_helper`, `region_picker`)

## Structure

- `src/` — everything that ships in the webview: Next.js pages (`app/`), React components (`components/`), hooks (`hooks/`), and all non-React logic (`lib/`)
- `src/lib/ipc.ts` — Tauri bridge: ONLY file with `@tauri-apps/*` imports
- `src/lib/core/` — pure TS business logic (config serialization, diff rendering, keymap helpers). No Tauri imports, no platform code.
- `src-tauri/` — Rust shell + Tauri commands (thin wrapper over `typer-core`)
- `src-tauri/binaries/` — Swift sidecar binaries (`ocr_helper`, `region_picker`) bundled into the `.app`
- `typer-core/` — platform-specific Rust library implementing the sender and OCR verify loop. Consumed by both `src-tauri/` and any CLI/test harness.
- `tests/` — non-shipped test infrastructure (fixtures, integration tests)
- `docs/` — design docs, decision log, PoC artifacts
- `docs/poc/` — Proof-of-concept artifacts that preceded this app: the Rust CLI that proved the typing-and-verify pipeline (`typer/`), Swift OCR sidecar sources (`ocr_helper/`), the authored sample corpus (`samples/code_corpus.txt`), the one stress-run capture that hit 0 typing errors (`results/stress1_*`), and the original Python predecessor (`python-predecessor/`). See [`docs/poc/README.md`](docs/poc/README.md).
- `.claude/` — agents, hooks, skills for this project
- `sandbox/` — gitignored scratch space for live-session smoke tests (screenshots, recorded runs against a real remote VM). See "Security constraints" below.

## Commands

- `pnpm tauri:dev` — Next.js + Tauri window with hot reload
- `pnpm tauri:build` — produces per-OS installers in `src-tauri/target/release/bundle/`
- `pnpm lint` / `pnpm lint:fix` — Biome check / auto-fix
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — Vitest full suite
- `pnpm test:fast` — Vitest unit tests only, excludes `*.integration.test.ts`
- `cd src-tauri && cargo fmt` / `cargo clippy` / `cargo test` — Rust side

## Key constraints

- **No clipboard.** The target VMs block paste in and paste out by policy. Keystream only ever sends keystrokes and reads pixels — never the clipboard.
- **Raw virtual keycodes, not unicode.** Windows App and similar RDP clients forward virtual keycodes and silently drop unicode injection. On macOS we use CGEvent keyboard events with Carbon HIToolbox keycodes. No `CGEventKeyboardSetUnicodeString`.
- **cliclick recipe for shift.** Plain keyDown/keyUp of the shift keycode around the target key; no `CGEventFlags`, no `flagsChanged` events. Apple's documented modifier-flag approach does not survive the RDP hop.
- **Shift warmup.** A dummy shift press-and-release during the pre-send countdown primes the VM's modifier state; without it the first shifted character often drops.
- **macOS only (today).** CGEvent, Apple Vision, and AppKit are Apple-exclusive. Cross-platform ports are future work, not v1.
- **No server, no cloud, no accounts.** Everything local.
- **Unsigned binaries in v1.** First-launch Gatekeeper warnings are documented, not avoided.
- **Chunked send-and-verify (v1 UX model).** Text is sent in 5-source-line chunks; each chunk is OCR-verified before the next is typed. Pass = 0 char diffs after fold. On fail, v1 pauses and asks the user to Skip / Stop / fix-then-Continue — no auto-rollback (auto-delete primitive deferred until Phase 2.5 PoC). Pre-send blocks if any line exceeds 80 chars. See `docs/design-plan.md` Q7–Q10.

## Security & coding rules

All detailed rules live in `.claude/rules/` (auto-loaded each session):
- **[rules/security.md](.claude/rules/security.md)** — screenshot handling, sandbox-only live tests, sidecar binary provenance, Tauri command validation, never-commit list
- **[rules/conventions.md](.claude/rules/conventions.md)** — logging, imports, naming, errors, Tauri/Next.js integration, keystroke timing, commits
- **[rules/testing.md](.claude/rules/testing.md)** — test layout, fixtures (captured OCR JSON, synthetic keystroke logs), integration patterns, mocking

## Docs

- [docs/design-plan.md](docs/design-plan.md) — design plan, locked decisions, data model, build phases
- [docs/progress.md](docs/progress.md) — current task tracker
- [docs/lessons.md](docs/lessons.md) — corrections and patterns to avoid repeating
- [docs/poc/](docs/poc/) — PoC sources, the CLI that proved the approach (0 typing errors / 9,160 chars against a real remote VM), corpus samples, screenshots
- [.claude/rules/conventions.md](.claude/rules/conventions.md) — coding conventions. Auto-loaded by Claude Code.

## Predecessor

PoC CLI at `docs/poc/typer/` (Rust, macOS CGEvent + Apple Vision) — proved the typing-and-verify pipeline end-to-end before the UI work started. The `typer-core` library is a direct descendant; the CLI itself is retained as a reference binary and lightweight test harness.
