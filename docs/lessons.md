# Lessons

Corrections and patterns to avoid repeating. Append one entry per lesson — don't edit past entries, add new ones. Every `dev-task` session reads this before planning.

Format: date · one-sentence rule · 1-3 lines of why.

---

## 2026-04 · Sender lessons from the PoC

### 2026-04-20 · Use virtual keycodes, never unicode injection

The RDP client we tested (Microsoft's "Windows App") silently ignores `CGEventKeyboardSetUnicodeString` and forwards only the virtual keycode. Sending "Hello world" with the unicode string set and keycode 0 typed 11 `a`s in the remote VM's Notepad. Keymap via Carbon HIToolbox keycodes is the source of truth. See [`poc/typer/src/keymap.rs`](poc/typer/src/keymap.rs) for the proven table.

### 2026-04-20 · Shift uses plain keycode events, not `CGEventFlags`

Apple's `CGEventFlagShift` approach doesn't survive the RDP hop. Tested all three `CGEventSourceStateID` and all three `CGEventTapLocation` combinations with flags set — all produced unshifted chars (`!@#$` → `1234`). cliclick's recipe is plain keyDown(shift) → keyDown(char) → keyUp(char) → keyUp(shift) with no flags and no `flagsChanged` events. That works. Copy it exactly. See `send_char()` in [`poc/typer/src/main.rs`](poc/typer/src/main.rs).

### 2026-04-20 · Always warm up shift during countdown

Without a dummy shift press during the pre-send countdown, the first shifted character drops (`Hello` → `hello`). The warmup primes the VM's modifier state tracking. Always on by default; do not expose a "disable warmup" option in UI. See `warmup_shift` in [`poc/typer/src/main.rs`](poc/typer/src/main.rs).

### 2026-04-21 · `Ctrl+Home` does not reach Windows App; use repeated `PageUp`

A CGEvent-posted `Ctrl+Home` (tried: Control keycode held around Home, and Home + `CGEventFlagControl`) did not scroll the remote VM's Notepad. Plain `PageDown` keycode 121 and `PageUp` keycode 116 (same keycodes Fn+Up/Fn+Down produce) do reach the VM. For scroll-to-top, send PageUp × ~40 — a cheap brute-force that works in any viewport size. See `run_scroll_verify()` in [`poc/typer/src/main.rs`](poc/typer/src/main.rs).

## 2026-04 · OCR lessons

### 2026-04-22 · Don't "fix" the sender to match OCR output

If the VM shows the correct character but OCR misreads it (e.g. `<` → `‹`, `0` → `e`), that's an OCR issue, not a typing error. Fold it in the compare stage, don't change keystroke timing. Adding a fold entry must include a comment citing the specific failure (what was on screen vs what Vision read) so future readers can distinguish real fixes from over-fitting. See `fold_char()` in [`poc/typer/src/main.rs`](poc/typer/src/main.rs).

### 2026-04-22 · Don't align diff by line index; use LCS

OCR deterministically drops certain lines (blanks, lone `}`, lone `;`). Positional line-zip propagates one drop into every subsequent line. Use LCS (longest common subsequence) alignment on folded lines, then compare characters within aligned pairs. Before LCS: 1/34 lines match. After LCS: 42/48 lines match with the same underlying text. See `align_lines()` in [`poc/typer/src/main.rs`](poc/typer/src/main.rs).

### 2026-04-22 · OCR helper output must be robust JSON

Parse OCR output with `serde_json::from_str` into a typed shape, handle errors, don't `unwrap`. The helper is ours today but the parser shouldn't panic if it's ever swapped for Tesseract or a remote service. Reference output shape: [`poc/results/stress1_ocr.json`](poc/results/stress1_ocr.json).

## 2026-04 · Delete-primitive lessons (Phase 2.5)

### 2026-04-24 · All five delete candidates reach AVD; Shift+Up × N + Backspace is the v2 pick

Phase 2.5's probe (`typer delete-backspace-n`, `delete-ctrl-z-once`, `delete-ctrl-z-five`, `delete-shift-up-backspace`, `delete-shift-up-forward-delete`) against AVD + Notepad: **all five reported CLEAN** — every candidate successfully removed a typed 5-line block. The open question going into Phase 2.5 was whether Shift+arrow combos would reach AVD via the Q2 cliclick recipe (plain keycodes, no `CGEventFlags`); the answer is **yes**. Q11 locks Shift+Up × N + Backspace as v2's delete primitive: minimal keystroke count, directly maps "N" to "lines," editor-portable. See [design-plan Q11](design-plan.md#q11--v2-auto-rollback-uses-shiftup-n--backspace).

### 2026-04-24 · Ctrl+Z works but is editor-semantics-dependent

Both `Ctrl+Z once` and `Ctrl+Z × 5` cleanly removed the test block in AVD + Notepad. But Ctrl+Z's *grouping* (what counts as one undo step) varies by editor — Notepad groups per-keystroke, IDEs often group per-word or per-burst, some editors group per-session. Over-undo is silent: one too many Ctrl+Z's deletes content the user typed *before* us, and we'd have no way to detect it without a separate verify pass. Not the right primitive for cross-editor auto-rollback. Kept as a historical alternative in case Shift+Up ever fails against a future RDP client.

### 2026-04-24 · A `#` flash during Ctrl+Z × 5 is harmless; noting for future readers

During the `delete-ctrl-z-five` probe the operator observed a brief `#` character flash in the editor before disappearing. Most likely cause: the editor's undo implementation momentarily re-renders a character during the rapid-fire Ctrl+Z sequence (undo replays the typed chars in reverse, and at ~50ms between presses the render pipeline can show a transient glyph). Not caused by our keystroke stream; not seen in the other four probes. Documented here so a future observer doesn't mistake it for residue.
