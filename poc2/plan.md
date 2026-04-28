# poc2 test plan & progress

Live tracker for the round-2 PoC. This is the doc to open first to see
where we are.

- Research source: [`methods.md`](methods.md)
- Background: [`../docs/v2-direction.md`](../docs/v2-direction.md)

## Status legend
- ☐ not started
- ▶ in progress
- ✅ done
- ✗ failed / abandoned
- ⏭ skipped (gated out)

---

## Phase 0 — setup

- ✅ poc2/ folder, samples, typer2 standalone crate
- ✅ shift-drop counter
- ✅ research survey (methods.md)

## Phase A — macOS local injection method (TextEdit, no OCR)

Goal: find a CGEvent variant that doesn't drop shift on a local Mac.
Each step is a single TextEdit run, eyeball results.

| # | Probe | Status | Result |
|---|---|---|---|
| 01 | local TextEdit baseline (current code) | ✅ | ~3 drops / 250 chars; bug is local, not RDP |
| 02 | sweep MOD_HOLD_MS (10/30/50/100ms) | ✅ | got worse with longer hold; ruled out |
| 02b | sweep CHAR_PAUSE_MS (0/10/30/50ms) | ✅ | no effect; rate is not the cause |
| 02c | flags-on-char (KeePassXC pattern) | ✅ | first attempt: shift latched forever (forgot to clear flags on unshifted) |
| 02c-fix | flags-on-char with explicit empty-flag clear | ✅ | 1/1 clean (~250 chars, 0 drops) |
| 02c2 | flag-on-char stress (3 back-to-back runs) | ✅ | **3/3 clean (~750 chars, 0 drops)** — leading candidate |
| 02d | sandwich + HID tap location | ✅ | 5 drops / 3 runs (~750 chars). Same rate as Session-tap; HID alone doesn't fix sandwich. |
| 02e | sandwich + Private event source | ✅ | **3/3 clean (~750 chars, 0 drops)**. Source state alone fixes sandwich. |
| 02f | flag-on-char + HID tap | ✅ | **3/3 clean (~750 chars, 0 drops)**. Confirms flag-on-char works on either tap. |
| 02g | flag-on-char + Private source | ✅ | **3/3 clean (~750 chars, 0 drops)**. |
| 02h | flag-on-char + HID + Private (full stack) | ✅ | **3/3 clean (~750 chars, 0 drops)**. enigo's config confirmed. |
| 02i | AppleScript `keystroke` | ✅ | 1/1 clean (~250 chars, 0 drops). Reliable baseline. |
| 02j | enigo crate | ✅ | 3/3 clean for shifted chars (~750 chars, 0 drops). Newlines didn't render (enigo `text()` doesn't map `\n` to Return). Confirms our config is sound. |

**Phase A exit gate**: ✅ COMPLETE. All 10 probes done.

### Phase A summary

| Method shape | Source | Tap | Drops |
|---|---|---|---|
| sandwich | Combined | Session | broken |
| sandwich | Combined | HID | broken |
| sandwich | **Private** | Session | clean |
| flag-on-char | Combined | Session | clean |
| flag-on-char | Combined | HID | clean |
| flag-on-char | Private | Session | clean |
| flag-on-char | Private | HID | clean (= enigo) |
| AppleScript | — | — | clean (baseline) |
| enigo crate | (Private+HID+flag) | | clean (external ref) |

**Conclusion**: the toxic combination is `sandwich event shape + Combined source`. Either fix alone eliminates shift-drops. HID tap alone does NOT fix sandwich.

**Phase B candidates** (any of these is a valid v2 fix, ranked by minimal change from current code):
1. **`sandwich + Private source`** — single-line change in `RealEventSource::session_default()`. Keeps the existing event shape.
2. **`flag-on-char + Combined source`** — change event shape, keep source. Matches KeePassXC.
3. **`flag-on-char + Private + HID`** — match enigo's full stack. Most defensive.

## Phase B — RDP/AVD validation

Run every Phase A winner (5 configs) against AVD. Each = 3 back-to-back runs into AVD Notepad, screenshot afterward.

| # | Probe | Status | Result |
|---|---|---|---|
| 03  | AVD: sandwich + Private | ✅ | 3/3 clean (~750 chars). Screenshot at poc2/screenshots/. |
| 03b | AVD: flag-on-char + Combined + Session (02c2) | ✅ | **CATASTROPHIC FAILURE**. 100% of shifted chars came out unshifted. RDP strips `CGEventFlagShift`. Validates the original CLAUDE.md note. |
| 03c | AVD: flag-on-char + Combined + HID (02f) | ✅ | **Same catastrophic failure as 03b**. HID tap doesn't rescue flag-on-char. |
| 03d | AVD: flag-on-char + Private + Session (02g) | ✅ | **Same catastrophic failure**. Private source doesn't rescue flag-on-char on RDP. |
| 03e | AVD: flag-on-char + Private + HID = enigo's stack (02h) | ✅ | **Same catastrophic failure**. Even enigo's "Apple-canonical" config dies on RDP. Confirms flag-on-char is RDP-incompatible regardless of tap/source. |
| 03f | AVD: AppleScript `keystroke` (02i) | ✅ | Looks clean (1 run, ~250 chars). **Surprisingly fast on AVD — whole chunk appeared near-instant.** Local TextEdit was ~10s for same input. AVD/RDP must be batching the events. |
| 03g | AVD: enigo crate (02j) | ✅ | **Broken on AVD**. Output was just "aaaa" — everything else stripped/invisible. Confirms enigo (= flag-on-char) is RDP-incompatible. |

**Phase B exit gate**: ✅ COMPLETE. 7 Phase A winners tested on AVD.

### Phase B summary

**RDP-compatible (2):**
- `sandwich + Private + Session` — single constant change in shipped code
- `AppleScript keystroke` — slow API, but RDP forwards it fine; fast through RDP

**RDP-incompatible (5):**
- All flag-on-char variants — RDP forwarder strips `CGEventFlagShift` regardless of tap or source
- enigo (uses flag-on-char internally) — same root cause

**Locked v2 fix**: `sandwich + Private source` — change `CGEventSourceStateID::CombinedSessionState` → `CGEventSourceStateID::Private` in `typer-core/src/event_source.rs::session_default()`. One-line diff. Existing event shape, existing tests, existing recording infra all unchanged.

This validates the original CLAUDE.md note: "Apple's documented modifier-flag approach does not survive the RDP hop." The methods.md research speculation that this might've been a Unicode-mode artifact was wrong — it's a real flag-stripping behavior in the RDP client.

## Phase B' — stress validation (long-form local)

Before any shipped-code change, validate the 2 RDP-compatible methods at scale on local TextEdit.

| # | Probe | Status | Result |
|---|---|---|---|
| 04a | STRESS: sandwich+Private (15k chars, local TextEdit) | ✅ | **PERFECT: 0/15,017 char diffs, 0 shift_drops, files byte-identical**. ~10 min continuous typing. |
| 04b | STRESS: AppleScript (15k chars, local TextEdit) | ✅ | **PERFECT: 0/15,017 char diffs, 0 shift_drops, files byte-identical**. Faster than expected (~2-3 min instead of ~10). |

## Phase B'' — stress validation on AVD (self-consistency)

No OCR/diff against source on the AVD side. Instead: type the same 15k corpus N times, save N output files in AVD, run `poc2/avd/compare_runs.py` in AVD to compare runs pairwise. If all N runs match → estimated error rate ~0. If they diverge, the diff pattern (shift-drop vs random) tells us which failure mode.

| # | Probe | Status | Result |
|---|---|---|---|
| 05a | AVD STRESS: sandwich+Private (3 runs × 15k) | ✅ | **PERFECT: 3/3 runs byte-identical, 0/45,051 char diffs, 0 shift-drops, error rate 0.0000%**. Deterministic on AVD. Screenshot: poc2/screenshots/. |
| 05b | AVD STRESS: AppleScript (4 runs × 15k) | ✅ | **CATASTROPHIC: each run lost ~half the input** (15,017 → 7,362–8,274 chars). 2,427 char diffs in first pair (27 shift-drops, rest random/dropped). RDP can't keep up with AppleScript's full-throttle firehose. Need throttling. |
| 05c | AVD STRESS: AppleScript THROTTLED (50ms per-line delay) | ✅ | Still lost lines. AVD's keystroke input buffer overflows on long inputs regardless of delay. Method B is fundamentally not viable for long sends on RDP. **Locked v2 winner: Method A.** |

**Comparator inside AVD**: `poc2/avd/compare_runs.py` (stdlib only). Copy this file into AVD once. After 5 runs, run `python compare_runs.py run1.txt run2.txt run3.txt run4.txt run5.txt` and copy the verdict back here.

### Phase B'' summary

| Method | Local 15k | AVD 3×15k | Verdict |
|---|---|---|---|
| **A: sandwich + Private** | 0 diffs | **0 diffs / 45,051 chars** | ✅ ship it |
| B: AppleScript (full speed) | 0 diffs | ~50% data loss | ✗ RDP buffer overflow |
| B: AppleScript (50ms/line) | n/a | still lost lines | ✗ fundamentally not viable for long sends |

**Locked v2 fix**: Method A — change `CGEventSourceStateID::CombinedSessionState` → `CGEventSourceStateID::Private` in `typer-core/src/event_source.rs::session_default()`.

Each: opens fresh empty TextEdit doc, types `stress_15k.txt` (15,017 chars, ~10 min). User saves with Cmd+S; we read the saved file and run `typer2 score` + `diff` to count any shift-drops or other diffs.

## Phase C — cross-platform sanity (only if Phase B fails)

| # | Probe | Status | Result |
|---|---|---|---|
| 04 | Linux ydotool on Arch | ☐ | gated on Phase B failure |
| 05 | Windows SendInput on Win10 | ☐ | gated on Phase B failure |

If both clean → bug is uniquely macOS + CGEvent → Phase D escape hatch.

## Phase E — speed optimization (local sweep)

Observation: at the broken `sandwich+Combined` baseline we needed defensive 10ms pauses; with the new `sandwich+Private` we hoped for 0ms. Reality is in between.

**Local sweep** (15k corpus, TextEdit, Method A):

| event_pause_ms | shift_drops | diff_lines | verdict |
|---|---|---|---|
| 0 | 1,790 | massive | catastrophic (shift drops everywhere) |
| 1 | 0 | 373 | shift latching across many lines |
| 2 | 0 | 265 | latching |
| 3 | 0 | 119 | latching |
| 4 | 0 | 12 | rare but real latching |
| **5** | **0** | **0** | **PERFECT — local floor** |
| 10 (default) | 0 | 0 | perfect, 2× safety margin |

**Failure mode below 5ms is shift LATCHING, not dropping.** Different bug from the original. Shift gets stuck "on" across multiple chars when posted too fast (lowercase becomes uppercase, digits become symbols).

**Local floor: event_pause_ms ≥ 5.** Default 10ms has 2× margin.

**AVD sweep**:

| event_pause_ms | total diffs / 45k chars | shift-drops | verdict |
|---|---|---|---|
| 5  | 28 (0.062%) | 28 (100%) | broken |
| 6  | 56 (0.124%) | 56 (100%) | broken |
| **7** | **0** | **0** | **PERFECT — AVD floor** |
| 10 | 0 | 0 | perfect (default, 30% margin over floor) |

**AVD floor: event_pause_ms = 7.** Sharp transition: 6→7 goes from broken to deterministic.

Production recommendation: keep `EVENT_PAUSE_MS = 10` for now (30% safety margin over AVD floor). Could ship at 7-8ms if we want speed. 10ms = ~25 ch/s; 7ms = ~33 ch/s — small win, not worth the risk margin.

## Phase D — fold winner into shipped code

Two branches:

**Happy path (Phase A or A+B succeeded):**
- update `typer-core/src/event_source.rs` with winning method
- run 140 cargo tests + v1 AVD smoke
- update `docs/v2-direction.md` with resolution
- delete fold-table band-aids if still needed (already done in main)

**Escape hatch (A+B+C all fail):**
- prototype Karabiner-DriverKit-VirtualHIDDevice as sidecar daemon
- big install friction (System Extension prompt, root daemon)
- only if there's no other option

---

## Findings log

### 2026-04-27 · 01 baseline (current code)
- TextEdit, shift_heavy.txt
- ~3 shift-drops in ~250 shifted chars
- Conclusion: bug is local-side, not RDP. CGEvent itself is dropping shifts.

### 2026-04-27 · 02 MOD_HOLD_MS sweep
- 10/30/50/100ms holds, eyeball count: 3/5/7/12
- Bigger hold → MORE drops. Counterintuitive — rules out "shift hadn't arrived yet" theory.

### 2026-04-27 · 02b CHAR_PAUSE_MS sweep
- 0/10/30/50ms, eyeball count: 3/3/1/3
- No clear trend. Rules out event-queue saturation.

### 2026-04-27 · methods.md research
- Our recipe is cliclick verbatim — we inherited the bug, didn't invent the fix
- KeePassXC uses flags-on-char (Apple lore: CGEventPost doesn't latch modifiers between events anyway, so 3-event sandwich may be the bug)
- enigo uses HID tap + Private source
- CLAUDE.md "flags don't survive RDP" likely came from Unicode-mode tests, not keycode flags
