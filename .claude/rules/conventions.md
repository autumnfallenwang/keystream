# Coding Conventions

Rules for writing code in this project. Referenced by the `dev-task` skill and `security-reviewer` agent. Follow these when implementing any task.

## Logging

### When to log

| Event | Level | Example |
|---|---|---|
| App startup (version, paths, build mode) | `INFO` | `app_version=0.1.0` |
| Calibration started / saved | `INFO` | `calibrate: saved region x=1 y=108 w=1707 h=922` |
| Send started | `INFO` | `send: started chars=1832 scroll_verify=true runs=1` |
| Send complete | `INFO` | `send: complete chars=1832 duration=28400ms skipped=0` |
| Send failed | `ERROR` | `send failed: event source creation returned null` |
| Verify result | `INFO` | `verify: aligned=48 matches=40 char_diffs=25 accuracy=98.37%` |
| OCR helper not found / not executable | `ERROR` | `ocr: sidecar missing at <path>` |
| Scroll chunk captured | `DEBUG` | `scroll: chunk 2/3 lines=31` |
| Permission check (accessibility / screen recording) | `INFO`/`WARN` | `permission: accessibility granted` / `denied` |
| User opened the app window / invoked a command | `INFO` | `ui: send_clicked` |

### Log format

**Rust:** `log::info!("operation key=value key2=value2");`
**TypeScript:** `await log("context: operation key=value");` (from `@/lib/ipc`)

Use `key=value` pairs for structured data. Prefix TS logs with the component context (`calibrate:`, `send:`, `verify:`, `settings:`).

### What level to use

| Level | When | Ships in release? |
|---|---|---|
| `ERROR` | Something failed that the user should know about | Yes |
| `WARN` | Something unexpected but recoverable (permission denied, OCR parse skipped a line) | Yes |
| `INFO` | Key lifecycle events (send start/end, calibrate, verify summary, app start) | Yes |
| `DEBUG` | Internal details useful for development (per-chunk OCR, keycode decisions, overlap matching) | No (dev only) |

Rule of thumb: if you'd want to see it in a bug report, it's INFO. If you'd only want it while developing, it's DEBUG.

### Where to call the logger

| Layer | How to log | Import |
|---|---|---|
| **Rust** (`src-tauri/src/`, `typer-core/src/`) | `log::info!()`, `log::warn!()`, etc. | `use log;` (implicit via Cargo) |
| **TS components** (`src/components/`, `src/app/`) | `await log()`, `await logWarning()`, `await logErr()` | `import { log, logWarning, logErr } from "@/lib/ipc"` |
| **TS IPC layer** (`src/lib/ipc.ts`) | `await invoke("log_info", { message })` | Direct invoke (ipc.ts IS the wrapper) |
| **Pure TS core** (`src/lib/core/`) | **Do NOT log from here.** These modules are pure and have no Tauri imports. Log at the CALL SITE. |

### What to NEVER log

- The **content** of sent text (chars, lines, snippets). Lengths and counts are fine.
- The **content** of OCR output (captured lines). Counts, diffs, accuracies are fine.
- File paths outside the user's own configured directories.
- Absolute screen coordinates beyond the calibrated region (if we ever capture elsewhere).

Logging "sent 1832 chars" is fine. Logging the actual chars is a security finding.

## Import conventions

- `@tauri-apps/*` imports only allowed in `src/lib/ipc.ts` (enforced by biome `noRestrictedImports`)
- Pure modules (`src/lib/core/`) must have no Tauri imports, no platform imports, no direct filesystem or network access
- React components import from `@/lib/ipc` for backend calls, from `@/components/` for UI, from `@/lib/core/` for pure helpers and types
- Use `@/` path alias for all imports from `src/`

## Error handling

- User-facing errors: plain language, no codes ("Could not start typing — grant Accessibility permission in System Settings and try again.")
- Log-facing errors: include the technical message (`send failed: CGEventSource::new returned null (combined state)`)
- Always catch + log in async operations before re-throwing or surfacing
- Use typed error enums in Rust (`thiserror` when it grows), plain `Error` subclasses in TS for now

## Naming

- Files: kebab-case (`verify-diff.ts`, not `verifyDiff.ts`) — enforced by biome
- Functions: camelCase (TS), snake_case (Rust)
- Types/interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE (TS), SCREAMING_SNAKE_CASE (Rust)
- CSS classes: Tailwind utilities, no custom class names (use inline styles for one-offs)
- Tauri command names: snake_case in the attribute (`#[tauri::command] fn run_send`), exposed as `runSend` on the TS side via Tauri's default conversion. Keep the Rust-side name snake_case and the TS call matching

## Tauri + Next.js integration

- Components that import from `src/lib/ipc.ts` (which imports `@tauri-apps/*`) must be loaded with `next/dynamic` + `ssr: false`. Direct top-level ipc imports from `page.tsx` break SSR / static export.
- Pattern: `page.tsx` uses `dynamic(() => import("@/components/send-panel"), { ssr: false })`, the component itself is `"use client"`.
- Next.js is configured for static export (`output: 'export'`). Do not use server-only features (server actions, route handlers, image optimization) — they don't survive `next build`.

## Keystroke timing

- All wait durations in Rust code are named (`event_pause_ms`, `mod_hold_ms`, `char_pause_ms`, `scroll_settle_ms`). No magic numbers.
- The cliclick recipe is the source of truth for shift: `keyDown(shift) → sleep(mod_hold_ms) → keyDown(char) → sleep(event_pause_ms) → keyUp(char) → sleep(mod_hold_ms) → keyUp(shift) → sleep(event_pause_ms)`. No flags, no `flagsChanged`. If you add a new modifier (Alt, Cmd), follow the same shape.
- Shift warmup (one dummy shift press/release during countdown) is mandatory before the first shifted character. Do not remove.
- `scroll_verify` uses PageUp × 40 to reach the top, not Ctrl+Home — Ctrl+Home posted via CGEvent does not reach the remote VM through the RDP clients we've tested. Documented in `docs/lessons.md`.

## OCR tolerance

- When comparing sent vs. seen, fold known OCR confusions before diff: `` ` `` ↔ `'`, `<` ↔ `‹`, `>` ↔ `›`, `"` ↔ `"` ↔ `"`, case-fold letters, `0`/`O`/`o` → one class, `1`/`l`/`I`/`i` → one class.
- Never "fix" our sender to match OCR output. If the VM shows the right character but OCR misreads it, the fold table handles it.
- When adding a new fold entry, add a comment citing the specific OCR failure observed (corpus + line + what we sent vs. what Vision read). Cross-reference a capture in `docs/poc/results/` if the failure is reproducible there. Future readers need to tell genuine typing errors from OCR noise.

## Commits

- Stage specific files with `git add`, never `-A` — prevents accidentally committing secrets or sandbox captures.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Append to commit body: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Never commit: `sandbox/`, `.env` (except `.env.example`), `*.db`, `*.sqlite`, screenshots of real work content, updater private keys.
