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

v1 sends in **5-source-line chunks** with **per-chunk OCR verify** (see Q7, Q9). Each chunk is typed, the calibrated region is captured, OCR'd, diffed against the chunk we just sent. On pass we move to the next chunk; on fail we **pause and surface to the user** (no auto-rollback in v1 — see Q10).

```
frontend: user pastes text or picks file → text loaded
frontend: pre-task gates evaluated:
  ├─ text loaded?
  ├─ all lines ≤ MAX_LINE_CHARS?  (Q8)
  ├─ region calibrated?
  └─ permissions granted?
       Send button enabled only when all four pass.

frontend: user clicks Send → invoke("run_send_verify", {text})
 ├─ countdown N seconds (user clicks into target VM during this window)
 ├─ shift warmup (Q3)
 └─ for each chunk of CHUNK_SIZE_LINES source lines:
     ├─ emit "chunk-start" {index, lines}
     ├─ typer-core::send_chunk → cliclick-style keystrokes via CGEvent
     ├─ sleep settle_ms
     ├─ typer-core::verify_visible
     │   ├─ screencapture calibrated region → ocr_helper sidecar → JSON
     │   └─ extract last N non-empty OCR lines
     ├─ typer-core::diff (LCS + char fold) → DiffStats
     ├─ if diff.char_diffs == 0 (Q9):
     │     emit "chunk-pass" {index} → frontend marks chunk green; continue
     └─ else:
           emit "chunk-fail" {index, diff} → frontend pauses, shows fail
           user chooses: Skip / Stop / (v2: Retry)
```

The PoC's full-file scroll-verify (`run_scroll_verify`) is retained in `typer-core` for a "verify-everything-at-end" mode (debug/regression use), but the v1 UI drives the per-chunk loop above.

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

### Q7 — Send in 5-source-line chunks, not whole-file in one shot

**Decision:** v1 sends text in fixed chunks of `CHUNK_SIZE_LINES = 5` source lines (split by `\n`). Each chunk is typed, then verified before the next chunk starts. The PoC's whole-file send is retained in `typer-core` but is not the UI's primary mode.

**Why:** The user-facing model is "type a piece, prove it landed, type the next piece." This:
- Localises failure (a bad chunk doesn't poison everything after it).
- Makes the text panel a live progress indicator (per-chunk highlight: untouched / in-progress / pass / fail).
- Keeps verify cycles bounded (a failed chunk is 5 lines to deal with, not 200).

5 was picked as a balance between OCR overhead (more chunks = more OCR cycles) and retry granularity (smaller chunks = smaller blast radius). Configurable later when settings exist (see Q11).

**Why source line, not visual line or fixed char budget:** Source lines (split on `\n`) match how the user reads code. Visual lines depend on window width. Fixed char budget breaks mid-statement. Source-line chunking pairs with Q8 (line-length pre-check) — once we cap line length, "5 lines" has predictable visual height and OCR cost.

**Source:** New in v1. PoC sent the whole file in one shot.

### Q8 — Pre-send line-length check, blocks Send if any line exceeds limit

**Decision:** Before Send is enabled, every source line in the input is checked against `MAX_LINE_CHARS = 80`. If any line is longer, Send is disabled and the offending line numbers + char counts are surfaced to the user. The user must fix the input externally and reload.

**Why:**
- Long lines force horizontal scroll on the AVD side. Vertical scroll we control (PageUp/PageDown reach the AVD per Q5); horizontal scroll we don't have a tested mechanism for.
- Even if horizontal scroll worked, OCR over a horizontally-scrolled viewport would only see a slice of the line, breaking verify.
- Code (the dominant input per the v1 user) rarely has lines >80 chars. When it does, the user controls the source and can wrap.

**v1 behavior:** block + report. **v2:** offer auto-wrap as an opt-in option.

**Source:** New in v1.

### Q9 — Per-chunk pass criterion: 0 char diffs after fold

**Decision:** A chunk passes verify iff `DiffStats.char_diffs == 0` after the OCR fold table is applied. Not "≥99% accuracy" — strict zero.

**Why:** The fold table (`fold_char` in PoC, locked decision Q4) exists exactly to absorb the deterministic OCR misreads (`<` → `‹`, `0` → `O`, case flips on certain letters, etc.). Anything the fold table doesn't catch is either:
- A real typing error (drop, double, wrong char) — must surface, not hide.
- An OCR misread we haven't characterised yet — surface so we can extend the fold table.

A percentage threshold would silently bury both. The 98.30–98.37% PoC number is a global *aggregate* across many chunks; per-chunk after fold should be 100%.

**Source:** New in v1. PoC reported aggregate accuracy, not per-chunk pass/fail.

### Q10 — On chunk fail, pause and surface; no auto-rollback in v1

**Decision:** When a chunk fails verify, v1 stops the send loop, marks the chunk fail in the UI, shows the diff, and offers the user three actions: **Skip** (mark this chunk failed-and-acknowledged, continue with next chunk), **Stop** (abort the whole send), or **Retry manually** (user fixes the AVD side themselves, then clicks Continue). v1 does **not** auto-delete the failed chunk and re-type.

**Why:** Auto-rollback requires a "delete the last N chars/lines we typed" primitive that the PoC does not have. Two candidate approaches were considered:
- **Backspace × N** — slow (4s per ~400-char chunk at PoC pacing) and *itself* subject to the same RDP-hop drop/double risk that verify exists to catch. Using a fragile keystroke to recover from a fragile keystroke compounds risk.
- **Shift+Up × CHUNK_SIZE_LINES + Backspace** — faster and bounded, but Shift+arrow combos are unproven against AVD. The PoC proved plain arrows / PageUp / PageDown reach AVD and that `Ctrl+Home` does not; Shift+arrow is in between and needs its own scroll-test-style probe.

Building auto-rollback before we've proven a reliable delete primitive would build the wrong thing. v1 ships with manual recovery; v2 adds auto-rollback once the Phase 2.5 PoC (see Build phases) lands a tested delete strategy.

**Source:** New in v1. PoC has only `clear_editor` (Ctrl+A + Backspace), which wipes the entire editor — used between full back-to-back stress runs, not for per-chunk recovery.

### Q11 — v2 auto-rollback uses Shift+Up × N + Backspace

**Decision:** When v2 adds auto-rollback for chunk-verify failures (Q10's "v1 ships with manual recovery" relaxation), the delete primitive is: Shift held, Up-arrow tapped N times (N = lines in the failed chunk), Shift released, Backspace fired once. All keystrokes use the Q2 cliclick recipe — plain keycodes, no `CGEventFlags`.

**Why:** Phase 2.5's interactive probe (tasks 20–22) fired all five candidates against AVD via `typer delete-<candidate>` subcommands. **All five cleanly removed a typed 5-line block** (Backspace × 30, Ctrl+Z once, Ctrl+Z × 5, Shift+Up × 5 + Backspace, Shift+Up × 5 + Forward Delete — all reported CLEAN). Every candidate works; choosing among them:

- **Keystroke count.** Shift+Up × N + Backspace is ~N+3 events (Shift down, N Up taps, Shift up, Backspace) regardless of chunk *character* count. Backspace × N scales with character count (30 for a 5-line block, 400+ for a 5-line block of long lines). Shorter = less RDP-hop drop exposure per rollback.
- **Robustness under RDP jitter.** If one keystroke drops, Shift+Up + Backspace under-selects by exactly one line and leaves that line as residue — detectable on re-verify. Backspace × N under-deletes by one character, which can look like a successful-but-noisy delete and bury the signal.
- **Count semantics.** "N Up-arrows" maps directly to "N lines of input we typed." Backspace × N requires computing `sum(len(line) for line in chunk) + len(chunk)` (chars plus newlines), which gets wrong whenever an editor auto-indents or auto-pairs (IDEs beyond Notepad).
- **Editor portability.** Ctrl+Z works but its grouping is editor-specific (one press undoes one keystroke in some editors, one word in others, one continuous typing burst in others). Over-undo is silent and scope-creeps into content the user typed before us. Shift+Up selection is uniform across text editors.

**Forward Delete vs Backspace on the selection:** both work (probe candidates 4 and 5 both reported CLEAN). Picking Backspace because:
- `KEYCODE_DELETE = 51` is already proven at high volume via the PoC's `clear_editor`.
- `KEYCODE_FORWARD_DELETE = 117` is proven against AVD by Phase 2.5's probe but has no other production usage in the PoC lineage.
- After deleting the selection the cursor lands at the start of the now-empty region — identical behavior for both keys on a selection. No semantic difference.

**Not chosen for v2:**
- **Ctrl+Z × N** — editor-specific grouping rules make "how many Ctrl+Z's undo N lines" indeterminate.
- **Backspace × N** — acceptable fallback if Shift+Up ever fails against a future RDP client, but we'd know only via the re-verify loop surfacing residue.

**Source:** Phase 2.5 probe commits `e740870` (combined `delete-test`) and `81ae8e7` (split into per-candidate subcommands). Operator-recorded outcomes (2026-04-24): all 5 candidates CLEAN on AVD + Notepad.

**Implication for future work:** a v2 library function `typer_core::delete_last_chunk(src, chunk_line_count, cfg)` can encapsulate the Shift+Up + Backspace sequence. Q10's "pause and surface" stays v1; v2 adds an Auto-Retry option that calls `delete_last_chunk` then re-types. The Tauri command `send_with_chunked_verify` gains a `retry_policy` parameter (`Manual` | `AutoRetry(max_attempts)`).

## Build phases

High-level ordering for the `dev-task` skill. See `docs/progress.md` for the live task list with statuses.

- **Phase 0 — PoC complete (done before this repo existed).** `docs/poc/` holds the verified lineage: the Python predecessor that surfaced the unicode-injection problem (`python-predecessor/`), the Rust CLI that solved it (`typer/`), Swift OCR sidecars (`ocr_helper/`), the 916-char sample corpus (`samples/code_corpus.txt`), and the one stress-run capture that first hit 0 typing errors (`results/stress1_*`). See `docs/poc/README.md` for the rebuild instructions.
- **Phase 1 — Scaffold.** Tauri + Next.js project, biome + vitest, rules docs, .claude workflow. ✅ done.
- **Phase 2 — Split typer-core.** Extract send / verify / scroll / LCS / stitch / fold from the PoC CLI into a reusable library crate. Keep a thin CLI shim. **Add a `send_chunk` + `verify_visible` pair (new for Q7/Q9) alongside the PoC's whole-file `run_send` + `run_scroll_verify`.** All numeric defaults live in named `const`s in one config module so v2 settings extraction is mechanical.
- **Phase 2.5 — Delete-primitive PoC.** Standalone CLI probe (mirrors PoC `scroll-test`) that fires several candidate "delete the last N lines" strategies against AVD and reports which ones reach: (a) Backspace × N, (b) Ctrl+Z, (c) Shift+Up × N + Backspace, (d) Shift+Up × N + Delete-key. Output feeds Q11 (delete strategy) and unblocks v2 auto-retry.
- **Phase 3 — Wire Tauri commands.** `calibrate`, `send_with_chunked_verify` (drives Q7+Q9 loop), `verify_visible`, `scroll_verify` (full-file debug mode), `get_region`, `clear_region`, `check_lines` (Q8 pre-check). Progress streamed via events: `chunk-start`, `chunk-pass`, `chunk-fail`, `send-complete`. Argument validation per `rules/security.md`.
- **Phase 4 — v1 UI.** Single-window layout. Immutable text panel showing the full input with per-chunk highlight (untouched / in-progress / pass / fail). Pre-task gate strip (text loaded / line check / region calibrated / permissions). Big countdown overlay during pre-send. Stop button + Esc hotkey. Collapsible diff view for failed chunks. On fail: pause + surface Skip / Stop / Retry-manually controls (Q10).
- **Phase 5 — UI polish.** Distinct visual identity (frontend-design pass), keyboard shortcuts, improved diff visualisation, permission tooltips, settings surface (CHUNK_SIZE_LINES, MAX_LINE_CHARS, COUNTDOWN_SECS).
- **Phase 6 — Stretch.** Auto-rollback retry (v2, depends on Phase 2.5 outcome), auto-wrap long lines (v2 of Q8), multi-profile config (different target windows), cross-platform scaffolding.
