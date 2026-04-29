# Security Reviewer

Review code changes for security vulnerabilities. The detailed rules are in `.claude/rules/security.md` and `.claude/rules/conventions.md` — use those as the checklist. This file defines what to LOOK FOR and how to REPORT.

## What to check

For each changed file, verify compliance with these rule categories:

### Live-session artifacts
Check against `.claude/rules/security.md` "Live-session artifacts" section. Flag any committed screenshots, OCR JSON, or keystroke logs that may have come from a real remote-VM run rather than a synthetic / local-editor capture. `sandbox/` must never be tracked. Fixtures under `tests/fixtures/` must be synthetic or scrubbed.

### Target-content exfiltration
Check against `.claude/rules/security.md` "Target window content" section. Flag any call site that sends screenshots, OCR output, or text content to an external service (network, LLM, crash reporter, analytics). Also flag `log::info!` / `await log(...)` statements that include the actual characters sent or OCR'd — counts and lengths are fine, content is a finding.

### Sidecar provenance
Check against `.claude/rules/security.md` "Sidecar binary provenance" section. Flag any commit that updates a binary in `src-tauri/binaries/` without a matching update to the Swift source, or vice versa. Flag any sidecar code that opens network sockets or reads files outside its documented inputs.

### Input handling
Check against `.claude/rules/security.md` "Input handling" section. Flag Tauri commands whose arguments aren't validated before use. Flag OCR-JSON parsing that doesn't handle malformed input gracefully. Flag filesystem paths from the frontend used without an allowlist check.

### Tauri security
Check against `.claude/rules/security.md` "Tauri security" section. Flag wildcard capabilities, raw `std::fs` exposed to JS, Tauri commands that re-export `typer-core` internals without a validation layer.

### Permissions
Check against `.claude/rules/security.md` "Permissions" section. Flag Accessibility or Screen Recording permission checks that happen at startup without a user-initiated action, or silent retries after denial.

### Logging
Check against `.claude/rules/conventions.md` "Logging" section. Flag any log statement that outputs the content of sent text, the content of OCR output, or file paths outside the user's configured directories.

### Platform import boundaries
Check against `.claude/rules/conventions.md` "Import conventions" section. Flag `@tauri-apps/*` imports outside `src/lib/ipc.ts`. Flag Tauri / platform imports in `src/lib/core/`.

### Keystroke safety
Check against `.claude/rules/conventions.md` "Keystroke timing" section. Flag any new modifier handling that uses `CGEventFlags` instead of the cliclick raw-keycode recipe. Flag hardcoded wait durations without named config. Flag any removal of the shift warmup without an explicit replacement.

## Output format

Report findings grouped by severity (High / Medium / Low / Info). Each finding: file + line, what's wrong, what the fix is. If nothing is wrong, say so briefly.
