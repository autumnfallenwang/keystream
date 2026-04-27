# Live-AVD smoke runbook (task 47)

End-to-end smoke against a real AVD / RDP target. This is the v1 ship-readiness
gate: a clean run here means Phase 4 is done. Operator-driven; gated out of CI.

## Goals (locked decisions Q7 + Q9)

A successful run achieves:

- **0 chunk failures** — every chunk passes after fold.
- **Aggregate accuracy ≥ 98.30%** — match the PoC stress-1 baseline.
- All chunks turn emerald in the Keystream UI.
- The `sendComplete` event arrives with `passed === total`, `failed === 0`,
  `skipped === 0`.

## Preconditions

- macOS arm64 (v1 ships arm64-only).
- `pnpm install` clean.
- `cd src-tauri && cargo build --workspace` clean.
- An AVD / RDP client open and visible, with a target editor focused (Notepad
  works; any plain-text editor that doesn't auto-format is fine).
- macOS **Accessibility** AND **Screen Recording** permissions granted to
  whichever binary you'll run:
  - For dev: the parent process (usually Terminal or your IDE).
  - For production: the installed Keystream.app from the dmg.
- A scratch directory for capture artifacts:
  ```sh
  mkdir -p sandbox/
  ```
  `sandbox/` is gitignored — captures never get committed.

## Procedure

### 1. Start Keystream

Two paths — pick one:

**Dev path** (faster iteration):
```sh
KEYSTREAM_LIVE_VM=1 pnpm tauri:dev
```
The env var is a documentation marker — it doesn't change runtime behavior, but
records intent that this is a live-VM session. See `.claude/rules/testing.md`.

**Production-bundle path** (closer to what users get):
```sh
pnpm tauri:build
open src-tauri/target/release/bundle/dmg/Keystream_*.dmg
# Drag to /Applications, run from Spotlight.
```

Use the production path for the *final* sign-off run.

### 2. Calibrate the region

Click the AVD's editor window so it's the focused window. Switch focus back to
Keystream. Click the **Region** indicator in the gate strip (top-left).

The `region_picker` Swift sidecar takes the screen. Drag a rectangle that:
- Covers the editor's visible text area.
- Excludes the editor's chrome (title bar, scrollbars, toolbar).
- Is large enough to fit a 5-line chunk vertically (per Q7, chunks are 5
  source lines).

Release. The strip's Region indicator should flip to ✓ with a badge like
`"Region 1707×922"`. Hover the badge to confirm the coordinates.

### 3. Load the locked corpus

In the text panel, click **Load File** → pick
`docs/poc/samples/code_corpus.txt`.

Expected:
- 29 lines, ~916 chars (verify by hovering the toolbar's "Locked · N chars · M
  lines" status text).
- Lines gate ✓ (the corpus is wrapped at ≤80 chars per Q8).

### 4. Verify gates

All four indicators should be ✓ before Send is enabled:

- **Text** ✓ — auto-locked after the file load.
- **Lines** ✓ — Q8 pre-check passed.
- **Region** ✓ — calibrated above.
- **Permissions** ✓ — Accessibility + Screen Recording granted.

If Permissions is ✗, click it → drawer expands → click "Open System Settings"
to grant. The page polls on visibilitychange, so flipping the toggle and
cmd-tabbing back to Keystream should auto-update.

### 5. Send

Click **Send** in the bottom controls. The countdown overlay appears: 3 → 2 →
1 → GO. **During** the countdown, click into the AVD's editor window so the
keystrokes land in the right place when typing starts.

### 6. Watch the run

`COUNTDOWN_SECS=3` then warmup (~50ms) then keystrokes start. Per chunk:

- Chunk's left-border turns blue (in-progress) + light-blue background.
- Keystrokes appear in the AVD editor.
- After the chunk finishes, `~CHUNK_VERIFY_SETTLE_MS=500ms` settle, then OCR
  capture + diff.
- On pass: chunk flips emerald.
- On fail: chunk flips red, expands automatically with the diff. Loop pauses
  awaiting Skip / Stop / Continue ack.

For the 29-line corpus and `CHUNK_SIZE_LINES=5`, expect **6 chunks**: 5 full
chunks of 5 lines each (lines 1–5, 6–10, …, 21–25) plus one trailing chunk of
4 lines (lines 26–29).

### 7. Success exit state

When the loop completes:

- Bottom-bar status reads `"Done · 6/6 passed"`.
- All 6 chunks are emerald-bordered.
- AVD editor contains the full corpus, no errors.

This is a **PASS**. Proceed to "Capture artifacts" + "Recording the result".

### 8. Capture artifacts

After a successful run:

- Screenshot the **AVD post-send** (full corpus typed, no errors). macOS:
  Shift+Cmd+4 → drag → name `sandbox/live-avd-smoke-YYYY-MM-DD-avd.png`.
- Screenshot the **Keystream UI** showing all chunks emerald + `"Done · 6/6
  passed"`. Save as `sandbox/live-avd-smoke-YYYY-MM-DD-keystream.png`.
- Copy the run's log lines:
  ```sh
  # Log path is built by lib.rs::default_log_dir.
  cp ~/Library/Application\ Support/dev.autumnfallenwang.keystream/logs/app.log \
     sandbox/live-avd-smoke-YYYY-MM-DD.log
  ```
  Trim to just the run's window (search for the most recent
  `app_version=0.1.0` entry).

`sandbox/` is gitignored — these artifacts stay local. Per
`.claude/rules/security.md`, never commit screenshots / OCR JSON / keystroke
logs from a real session.

### 9. Recording the result in `docs/lessons.md`

Append a dated entry under the **Phase 4 lessons** section. Format mirrors the
existing Phase-2.5 entries:

```md
### YYYY-MM-DD · Phase 4 live-AVD smoke (PASS)

Run against AVD <client + version> with <target editor>. <N> chunks,
<bytes> bytes, accuracy <pct>%, 0 chunk failures. <Any anomalies>.
Captures at sandbox/live-avd-smoke-YYYY-MM-DD-*.
```

**Counts only.** Per `.claude/rules/conventions.md` and `rules/security.md`, never
record the typed content. Lengths, line counts, accuracy percentages, char_diffs
aggregates are fine.

After this entry lands and is committed, **task 47 moves to done** and Phase 4
is complete. v1 ships.

## What to do on failure

### Chunk failure (red)

Click the failed chunk to expand the diff inline. Three causes ranked by
likelihood:

**(a) New OCR confusion the fold table doesn't catch**.

The diff shows a Mismatch row where the visual character (in `seen`) is what
you'd expect from looking at the AVD editor screenshot, but Vision misread it.
Common candidates: glyph variants we haven't seen yet (specific code points or
font-rendering quirks). Action:

1. Click **Skip** to ack and let the rest of the run proceed (gather more
   evidence in the same session).
2. Note the specific char + the OCR-misread substitute in
   `sandbox/live-avd-smoke-YYYY-MM-DD-anomalies.txt`.
3. After the run: add a fold-table entry in `typer-core/src/fold.rs` with a
   comment citing the observed misread (per `rules/conventions.md`'s "Adding a
   fold entry must include a comment citing the specific failure"). Re-run the
   smoke.

**(b) Genuine typing error** (drop / double / wrong char).

The AVD editor visually shows the wrong character — not just an OCR misread.
This would invalidate Q1 (CGEvent + virtual keycodes), Q2 (cliclick recipe), or
Q3 (shift warmup). Major regression.

Action:
1. Click **Stop**.
2. Capture the AVD screenshot showing the wrong char.
3. File this as a high-priority bug; do NOT add a fold-table entry — never
   "fix" the sender to match OCR (per `rules/conventions.md`).

**(c) Window misalignment / focus drift**.

The AVD scrolled mid-send (often happens if you accidentally clicked or the
host triggered a notification overlay). The OCR captures content that doesn't
correspond to the chunk we just typed.

Action:
1. Click **Stop**.
2. Re-calibrate the region.
3. Re-run from a clean editor (Cmd+A / Backspace in AVD's editor — the v1 has
   no auto-rollback, so you start fresh).

### Stop button used

You used **Stop** mid-run (or pressed Esc). The backend cancels at the next
chunk boundary; the UI shows the yellow `stopped` chunk + remaining chunks
revert to gray. Document why you stopped in the lessons entry — the smoke is
inconclusive until a clean run lands.

### Send button never enables

One of the four gates is ✗. The bottom-bar status reads `"Waiting on N
gate(s)"`. Click each ✗ indicator and remediate via its drawer/flow.

### Region calibrate fails

The `region_picker` sidecar emits a non-zero exit or unparseable stdout. The
strip's Region indicator shows `"Region · failed"` with the error in the hover
tooltip. Common causes:
- The Swift sidecar binary is missing — rebuild via the `src-tauri/binaries/`
  README.
- macOS denied accessibility input — grant the relevant permission.

## What this runbook does NOT cover

- **Multi-display setups** — the calibrated region's coordinates are screen
  pixels in the OS's native space. Multi-display has its own quirks; v1 was
  developed against a single display.
- **Non-Notepad editors with auto-formatting** — Word, IDEs with autocomplete,
  etc. break the verify loop because the editor inserts characters Keystream
  didn't type.
- **RDP clients we haven't tested** — only Microsoft's "Windows App" is
  proven. Other clients may follow the same CGEvent semantics but haven't been
  smoked.

## Cross-references

- Locked decisions: [`docs/design-plan.md`](../design-plan.md) Q1–Q11.
- Convention rules: [`.claude/rules/conventions.md`](../../.claude/rules/conventions.md),
  [`rules/testing.md`](../../.claude/rules/testing.md),
  [`rules/security.md`](../../.claude/rules/security.md).
- PoC baseline:
  [`docs/poc/results/`](../poc/results/) — the stress-1 capture (98.30–98.37%
  char accuracy, 0 typing errors over 9,160 chars across 5 runs) is the gold
  standard task 47 must match.
- Log path source of truth: `default_log_dir` in
  [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs).
