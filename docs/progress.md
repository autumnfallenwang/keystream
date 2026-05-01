# Progress

Live status tracker. The "why" behind each phase lives in [`design-plan.md`](design-plan.md) (Q-decisions + visual contract); per-walkthrough findings in [`backlog.md`](backlog.md); historical corrections in [`lessons.md`](lessons.md).

## v1 retrospective (preserved for context)

v1 (Phases 1–4 + Phase 2.5) shipped a per-chunk OCR-verify architecture with 16 Tauri commands, a four-gate UI, and a fail-and-retry handshake. The live-AVD smoke (task 47) surfaced intermittent shift-drops, which led to the poc2 keystroke-injection study (see [`lessons.md`](lessons.md)). poc2 found that switching the CGEvent source state to `Private` eliminates the bug entirely — at byte-perfect input reliability, OCR-verify becomes unnecessary complexity. v2 is a substantial simplification.

v1 freeze: 140 cargo tests + 78 vitest tests passing. Most v1 code becomes obsolete in v2 (OCR pipeline, region calibration, chunked verify, fail-and-retry UX, `region_picker` sidecar). The keystroke sender stays — with the Q12 fix.

## v2 phase status

| Phase | Title | Status |
|---|---|---|
| v2-0 | poc2 study (method survey, RDP validation, speed-floor characterization) | done |
| v2-design | UI design locked (Q12/Q13/Q14 + visual contract in design-plan.md) | done |
| v2-1 | Apply Q12 fix in shipped code | done |
| v2-2 | Strip OCR + chunking from `typer-core/`; add Q14 SendControl | done |
| v2-3 | Strip OCR + chunking from `src-tauri/`; add pause/resume commands | done |
| v2-4 | Rewrite frontend for the locked v2 UI | done |
| v2-5 | Settings pane (Q13) — 4 dials + persistence | done — operator smoke pending |
| v2-7 | Settings shell + Appearance (Q15, Q17) | done — operator smoke pending |
| v2-9 | User-resizable sidebar width (Q19) | done — operator smoke pending |
| v2-8 | File explorer sidebar (Q18) | done — operator smoke pending |
| v2-10 | Replace text panel with CodeMirror 6 (Q22) | done — operator smoke pending |
| v2-11 | Replace sidebar resize handle with react-resizable-panels (Q23) | done — operator smoke pending |
| v2-6 | Polish + ship | pending — depends on v2-11 operator smoke |

Each phase's contract + rationale: see the matching Q-decision(s) in [`design-plan.md`](design-plan.md). Each phase's implementation plan is drafted by `/dev-task` at the time of fire and lives in `~/.claude/plans/`.

**Current test count:** 262 vitest passing · 103 cargo passing.

## What's Next

**Operator handoff before v2-6 (polish + ship) starts.** Six manual checks against a built `.app` bundle:

1. **Settings persist across app relaunch.** `pnpm tauri:build` → install Keystream.app → open Settings → change Event pause to 8ms → quit → relaunch → confirm 8ms is still selected.
2. **Reset to defaults persists.** Click Reset → confirm dials snap back to 10ms / 10ms / 3s / warmup ON, palette to Atelier, mode to System, size to Small → quit → relaunch → confirm reset persisted.
3. **Appearance palette swap is live.** Settings → Appearance → click Solarized → bg switches immediately. Click Mode = Light → palette inverts. Set custom size 130% → all UI scales up.
4. **Settings sidebar swap.** Click Settings cog in main sidebar → entire sidebar swaps. Clicking "← Back to text" returns to main sidebar + text panel.
5. **Back-compat for existing settings.json.** Manually delete the `appearance` key from `<app_data_dir>/settings.json` (or use a v2-5-era file) → relaunch → app loads with defaults Atelier/System/1.0 and existing timing values intact.
6. **First v2 RDP smoke.** With AVD/Notepad focused, load `tests/fixtures/code_corpus.txt` (29 lines, 916 chars) → click Send → expect 0 shift-drops at the default 10ms event_pause_ms.

Items 1–5 are quick (under 5 min total). Item 6 is the bigger commitment — after it succeeds, v2 is end-to-end validated and **Phase v2-6** (polish + ship) begins.

**v2-10 operator smoke (CodeMirror 6 swap).** Now that the rendering engine is CodeMirror, run these alongside items 1–6 above:

7. **Editor mounts on file open.** Open any `.ts`/`.py`/`.rs`/`.json`/`.md` file → text appears with syntax highlighting; line numbers in the gutter; cursor caret visible.
8. **Edit / Lock toggle.** Type to edit; toggle Lock → cursor disappears, typing does nothing; toggle back to Edit → typing resumes. Undo (⌘Z) works (free win from CodeMirror's history extension).
9. **Wrap toggle (Q21).** Toggle Wrap on → long lines wrap; gutter line numbers stay aligned to the start of each source line. Toggle off → no horizontal scroll glitches.
10. **Active-line scanline (Q14).** Lock + Send → after countdown, active line shows the accent glow + ::before scanline animation. Pause → freezes mid-sweep. Resume → animates again. Stop → indicator clears.
11. **Cross-file load.** Click another file in the explorer → editor swaps content; no flash; new language highlighting.
12. **No-extension / unknown file.** Open a `Makefile` (or any `.xyz`) → editor mounts, no syntax highlighting, no crash.

**Phase v2-11** (sidebar resize → react-resizable-panels) is the next code phase. Anchor: Q23 in `design-plan.md`. Triggered by a walkthrough finding ("drag doesn't stick to the mouse") that scored the hand-rolled `resize-handle.tsx` at 2/5 signals: bug-ratio inversion (third UX iteration on the same component) + defensive justification (15-line apology comment explaining the iteration history). Scope: swap drag engine while preserving Q19's px-based persistence + clamp + double-click reset. Estimated 30–45 minutes plus tests.

**v2-11 operator smoke** (after the swap lands):

13. **Drag tracks mouse exactly.** Click and hold the sidebar's right edge → drag → the edge stays glued to the cursor at every position from min (180px) to max (600px), no offset, no jitter.
14. **Min/max clamps.** Drag past the left edge → sidebar snaps to 180px and stops. Drag past 600px → snaps to 600 and stops.
15. **Double-click resets to default.** Double-click the resize handle → sidebar jumps to 260px.
16. **Persists across relaunch.** Drag to ~340px → quit → relaunch → sidebar opens at 340px.
17. **Window resize.** Resize the app window → sidebar reflows proportionally (new behavior — the lib's default; matches modern desktop apps).

**Phase v2-6** (polish + ship) closes the v2 cycle. Depends on items 1–17 above being green.
