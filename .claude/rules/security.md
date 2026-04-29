# Security Rules

## Live-session artifacts

- Anything captured from a real remote-desktop session (any VM, any RDP client) — screenshots of the target screen, OCR JSON produced from those screenshots, recorded keystroke logs from real user work — goes in `sandbox/` (gitignored). Never committed.
- Fixtures committed under `tests/fixtures/` must be **synthetic or scrubbed**: keystroke logs against a local text editor, code snippets we authored, screenshots of dummy text. No snapshots of real work content.

## Target window content

- Treat whatever is on the user's screen during a send-and-verify cycle as potentially sensitive. The user may be piping private text into an internal VM.
- Do not upload captured screenshots, OCR output, or transcripts of sent text to any external service (LLM APIs, crash reporters, analytics).
- Do not log the **content** of what was typed at `INFO` level or above. Log lengths, line counts, timings, error classes — not characters. Logging "sent 1832 chars, 0 skipped" is fine; logging the actual text is a finding.
- **Persistence is not logging.** Saving the user's last-loaded text to the app data dir (for convenience across app restarts) is OK — it's user-initiated, local-only, under the user's filesystem permissions, and reversible via a Clear button. Logging that same content into a log file is not OK. The difference: persistence is a product feature the user controls; logs travel with bug reports.

## Sidecar binary provenance

- The Swift sidecars (`ocr_helper`, `region_picker`) are built from sources in `src-tauri/binaries/src/`. The binaries themselves are committed to `src-tauri/binaries/` so Tauri's bundler can pick them up without a Swift toolchain on every CI runner.
- Every update to a sidecar binary must include a rebuild from the committed source and a matching commit to the source files. Don't commit a binary without its source, and don't commit a source change without the rebuilt binary.
- Sidecars must never reach the network. `ocr_helper` reads a local PNG and writes JSON to stdout; `region_picker` opens a full-screen overlay and writes coordinates to stdout. That's it.

## Input handling

- Every `#[tauri::command]` handler must validate its arguments. Frontend is not trustworthy.
- File-path arguments from the frontend must be resolved against an allowlist of directories (user's documents folder, app data, tmp). Never allow the frontend to read arbitrary filesystem paths.
- OCR output parsed as JSON must assume malformed input. Use `serde_json::from_str` with a typed target, not `Value` traversal, and handle errors gracefully — the OCR helper is ours, but the parser should still not panic on bad input.

## Tauri security

- Capabilities / allowlist (`src-tauri/capabilities/`) must be narrow. No wildcard `"*"` permissions. Only grant what the UI actually calls.
- Filesystem access (when added) must use Tauri's scoped FS API, not raw Rust `std::fs` exposed to JS.
- Do not expose `typer-core`'s internal functions directly. Each Tauri command is a curated entry point with its own validation.

## Permissions

- Keystream requires macOS Accessibility permission (to post CGEvents) and Screen Recording permission (to `screencapture` the calibrated region). Both are per-binary.
- Do not auto-prompt for permissions in the background. Gate behind an explicit user action (Calibrate, Send, etc.) so the prompt appears in the right context.
- Never escalate or retry a permission check silently — if permission is denied, surface the "open System Settings" flow in the UI.

## Never commit

- `sandbox/` (any contents)
- Screenshots, OCR JSON, or keystroke logs from real user work
- `.env` files (except `.env.example` at repo root with dummy values)
- Tauri updater signing keys (`tauri-updater.key`, `tauri-updater.key.pub`)
- SQLite DBs (`*.db`, `*.sqlite`)
- macOS Keychain dumps or passwords — Keystream doesn't use the keychain today, but this rule pre-empts any future addition
