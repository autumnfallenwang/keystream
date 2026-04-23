# Keystream Design Plan

This document captures the architecture, data flow, and the "why" behind each decision. The **Locked Decisions** section is append-only — never edit past entries without user approval.

## Goal

Reliably type arbitrary text into a remote virtual desktop or RDP session when the clipboard is blocked, and verify the result via OCR. Target user is a Mac operator working into a Windows VM; cross-platform ports are future work.

## Three-layer architecture

1. **Rust core** (`typer-core/`) — platform-specific keystroke sender, OCR verify loop, LCS alignment, chunk stitching. No UI, no Tauri dependency. Already proven at 98.30–98.37% char accuracy (0 typing errors) across a 5-run / 9,160-char stress test.
2. **Tauri shell** (`src-tauri/`) — thin Rust wrapper. Exposes `typer-core` functions as `#[tauri::command]` handlers, streams progress via events, owns permission prompts and sidecar process management.
3. **Next.js frontend** (`src/`) — React UI in Tauri's webview. File loading, calibration, send-and-verify controls, live progress, diff visualization. Static export (`output: 'export'`), no server.

Pure business logic (diff rendering, config serialization) lives in `src/lib/core/` — no platform imports, unit-testable without Tauri.

## Data flow (typical send-and-verify run)

```
frontend: user picks file → invoke("load_file", path) → string
frontend: user clicks Send (verify=on) → invoke("run_send_verify", {text, cfg})
 ├─ src-tauri command handler validates cfg, calls typer-core::run_send
 │   ├─ cliclick-style keystrokes via CGEvent
 │   └─ emits "typer-progress" events (char N/M) back to frontend
 ├─ typer-core::scroll_verify
 │   ├─ PageUp x40 → screencapture region → ocr_helper sidecar → JSON
 │   ├─ PageDown loop, capture per viewport, stitch by tail/head overlap
 │   └─ returns stitched text
 ├─ typer-core::diff (LCS line alignment + char fold)
 └─ returns DiffStats to frontend → rendered as sent-vs-seen panel
```

## Locked Decisions

Decisions below are load-bearing. New `dev-task` / `walkthrough` work must not contradict them without explicitly raising a new Q with the `supersedes QN's claim that ...` phrasing.

### Q1 — Sender uses CGEvent with virtual keycodes, not unicode injection

**Decision:** On macOS, keystrokes are posted via `CGEvent::new_keyboard_event` with US-ANSI Carbon HIToolbox keycodes. Unicode injection (`CGEventKeyboardSetUnicodeString`) is never used.

**Why:** The RDP client we tested against (Microsoft's "Windows App") silently ignores the unicode string and forwards only the virtual keycode. A test with `CGEventKeyboardSetUnicodeString` set to "Hello world" + keycode 0 produced 11 `a`s in the remote VM's Notepad. Keycodes work; unicode does not. We expect other RDP clients to behave similarly but haven't proven it.

**Source:** [`docs/poc/typer/src/keymap.rs`](poc/typer/src/keymap.rs) (US ANSI keycode table), [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) `key_event()`.

### Q2 — Shift uses the cliclick raw-keycode recipe, not `CGEventFlags`

**Decision:** Shifted characters are sent via plain `keyDown(shift) → keyDown(char) → keyUp(char) → keyUp(shift)` with `event_pause_ms` sleeps between events. No `CGEventFlags::CGEventFlagShift`, no `flagsChanged` events.

**Why:** Apple's documented flag-based approach (set `CGEventFlagShift` on the keydown) does not reach Windows App through the RDP hop. All three event-source states and all three tap locations were tested; all failed identically, producing unshifted chars (`!@#$` → `1234`). cliclick's TypeAction.m source uses plain keycode events and works; we mirror it.

**Source:** [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) `send_char()`.

### Q3 — Shift warmup during countdown

**Decision:** Before the first character of a send, while the countdown is displaying, send one dummy shift keyDown/keyUp pair (~10ms hold, then 50ms settle). This is always on by default.

**Why:** Without warmup, the first shifted character in a send often drops — tested repeatedly, `Hello` typed as `hello`. The warmup primes the VM's modifier tracking. Tested and proven to eliminate first-char drops.

**Source:** [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) `warmup_shift` flag and the countdown loop inside `run_send`.

### Q4 — OCR verification via Apple Vision sidecar, not the Rust process

**Decision:** OCR is implemented in a Swift sidecar (`ocr_helper`) that takes a PNG path and emits JSON. The Rust process shells out via `Command::new()`.

**Why:** Apple Vision (`VNRecognizeTextRequest`) is the highest-quality OCR we have access to on Mac, and it's only available from Swift / ObjC. Building a Rust ↔ Swift FFI would add complexity for no measured benefit; the subprocess call is <200ms. Tested: Vision hits 100% on our authored corpus and has a small, documented set of systematic failures (see conventions.md "OCR tolerance").

**Source:** [`docs/poc/ocr_helper/ocr_helper.swift`](poc/ocr_helper/ocr_helper.swift). Reference output: [`docs/poc/results/stress1_ocr.json`](poc/results/stress1_ocr.json).

### Q5 — Scrolling via PageUp/PageDown keycodes, not `Ctrl+Home` / `Ctrl+End`

**Decision:** For multi-viewport files, the scroll-verify flow sends PageUp × 40 to reach the top, then PageDowns to walk through the file. Ctrl-combined shortcuts are not used for scroll navigation.

**Why:** `Ctrl+Home` via CGEvent (both with and without the Control keycode held down) does not reach Windows App's forwarded input — tested interactively. Plain `PageDown` keycode 121 and `PageUp` keycode 116 do reach it; these are what `Fn+Down` / `Fn+Up` produce on a Mac keyboard. Using raw PageDown/PageUp works; Ctrl combos don't.

**Source:** [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) `run_scroll_verify()`.

### Q6 — Content-based LCS alignment for sent-vs-seen diff, not positional

**Decision:** To compare sent text against OCR output, we use LCS (longest common subsequence) alignment on folded lines, then char-level diff within aligned pairs. Not positional zip.

**Why:** OCR drops certain lines deterministically (blank lines, lines containing only `}` or `;`). Positional zip causes one drop to cascade into every subsequent line looking like a mismatch. LCS aligns by content, so a drop is isolated to one row and reported separately (`OCR_DROP` / `OCR_XTRA`). Stress test without LCS: 1/34 lines "match" at 0% accuracy; with LCS: 42/48 lines match at 98.37%.

**Source:** [`docs/poc/typer/src/main.rs`](poc/typer/src/main.rs) `align_lines()` + `print_diff()`. Corpus: [`docs/poc/samples/code_corpus.txt`](poc/samples/code_corpus.txt).

## Build phases

High-level ordering for the `dev-task` skill. See `docs/progress.md` for the live task list with statuses.

- **Phase 0 — PoC complete (done before this repo existed).** `docs/poc/` holds the verified lineage: the Python predecessor that surfaced the unicode-injection problem (`python-predecessor/`), the Rust CLI that solved it (`typer/`), Swift OCR sidecars (`ocr_helper/`), the 916-char sample corpus (`samples/code_corpus.txt`), and the one stress-run capture that first hit 0 typing errors (`results/stress1_*`). See `docs/poc/README.md` for the rebuild instructions.
- **Phase 1 — Scaffold.** Tauri + Next.js project, biome + vitest, rules docs, .claude workflow. ← we are here
- **Phase 2 — Split typer-core.** Extract send / verify / scroll / LCS / stitch / fold from the PoC CLI into a reusable library crate. Keep a thin CLI shim.
- **Phase 3 — Wire Tauri commands.** `calibrate`, `send`, `verify`, `scroll_verify`, `get_region`, `clear_region`. Progress streamed via events.
- **Phase 4 — Minimal UI.** File picker, calibrate button, send + verify buttons, live progress, diff view. No design polish.
- **Phase 5 — UI polish.** Tailwind + shadcn components, keyboard shortcuts, better visual diff, help tooltips for permissions.
- **Phase 6 — Stretch.** Multi-profile config (different target windows), retry-on-mismatch, cross-platform scaffolding.
