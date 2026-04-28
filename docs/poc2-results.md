# poc2 results — keystroke injection method survey

**Conducted:** 2026-04-27 → 2026-04-28
**Driver:** intermittent shift-drops observed in v1 live-AVD smoke (`(` → `9`, `Q` → `q`, etc.)
**Outcome:** locked the v2 fix — change `CGEventSourceStateID::CombinedSessionState` → `CGEventSourceStateID::Private` in `typer-core/src/event_source.rs::session_default()`.

Raw experiment artifacts (samples, scripts, screenshots, plan tracker) live in [`poc2/`](../poc2/). Treat this doc as the canonical summary; poc2/ as the workshop.

## Headline findings

1. **Bug is local-Mac, not RDP.** Shift-drops happen typing into local TextEdit too — not just over an RDP hop. The original assumption (RDP forwarder strips modifier state) was wrong. CGEvent itself is the source.
2. **Bug is `CombinedSessionState`-specific.** The default source state mixes our injected events with the user's physical keyboard state; under sustained typing this corrupts modifier tracking. `CGEventSourceStateID::Private` gives our injection an isolated modifier-state machine and the bug disappears.
3. **`CGEventFlagShift` does NOT survive the RDP hop.** This *was* a real RDP-side phenomenon — confirms the existing `lessons.md` 2026-04-20 note. Methods that put shift on the char event itself (KeePassXC pattern, enigo, anything using `setFlags`) work locally and **catastrophically fail on AVD** — every shifted char drops to its unshifted base.
4. **Speed has a floor, not zero.** Below `event_pause_ms = 5ms` locally, shift state *latches on* (lowercase becomes uppercase). On AVD the floor is 7ms. Default 10ms has comfortable margin on both.

## What we tested

| # | Method | Local TextEdit | AVD | Verdict |
|---|---|---|---|---|
| baseline | sandwich + Combined + Session (current shipped) | drops ~1% (~3/250 chars) | drops in live-AVD smoke | broken |
| | sandwich + Combined + HID | drops 5/750 | not tested | tap layer alone doesn't fix it |
| **A** | **sandwich + Private + Session** | **0/750** | **0/45,051 across 3×15k runs** | **✅ v2 winner** |
| | flag-on-char + Combined + Session | 0/750 | 100% catastrophic (every shifted char drops) | flag stripped by RDP |
| | flag-on-char + Combined + HID | 0/750 | 100% catastrophic | flag stripped by RDP |
| | flag-on-char + Private + Session | 0/750 | 100% catastrophic | flag stripped by RDP |
| | flag-on-char + Private + HID (= enigo's stack) | 0/750 | 100% catastrophic | flag stripped by RDP |
| | enigo crate (third-party reference) | 0/750 (shifted chars; no newlines) | broken (only `aaaa` rendered) | uses flag-on-char internally |
| **B** | AppleScript `keystroke` | 0/250 single, 0/15,017 stress | 0/250 single | works at small scale; **collapses at 15k**: ~50% data loss because RDP can't keep up with AppleScript's batched event firehose, even with explicit per-line delay |

Method A is the only candidate that:
- Works at scale on local Mac (15,017 chars, byte-identical to source)
- Works at scale on AVD (3 × 15,017 chars, all 3 byte-identical to each other)
- Requires the smallest possible code change (one constant)
- Keeps the existing event shape, so all 140 cargo tests still apply unchanged

## Speed-floor characterization (Method A)

`event_pause_ms` sweep against the locked method, 15k corpus each value:

| event_pause_ms | local diffs | AVD diffs (3×15k = 45,051 chars) | failure mode |
|---|---|---|---|
| 0 | 1,790 shift-drops | not tested | 12% drop rate |
| 1 | 0 drops, 373 line diffs | not tested | shift LATCH (stuck on) |
| 2 | 0 drops, 265 line diffs | not tested | shift latch |
| 3 | 0 drops, 119 line diffs | not tested | shift latch |
| 4 | 0 drops, 12 line diffs | not tested | rare shift latch |
| **5** | **0 / 0** | 28 (modifier issue at low rate) | **local floor; AVD broken** |
| 6 | 0 / 0 (not retested) | 56 (same pattern) | AVD broken |
| **7** | 0 / 0 (not retested) | **0 / 45,051** | **AVD floor** |
| **10 (default)** | **0 / 0** | **0 / 45,051** | safe production default |

Interpretation: below the floor, shift events are posted faster than the OS can register them as modifier state — but instead of dropping (the original bug), the shift state *latches on* across multiple chars (`5` becomes `%`, lowercase becomes uppercase). Different bug, same root cause: timing the modifier state machine.

Production recommendation: keep `EVENT_PAUSE_MS = 10ms` (~25 ch/s). 30% margin over the AVD floor. Speed is not the gating concern; correctness is.

## What's locked for v2

The v2 fix is **one line** in `typer-core/src/event_source.rs::session_default()`:

```rust
// before
CGEventSourceStateID::CombinedSessionState

// after
CGEventSourceStateID::Private
```

That's the entire change. No new event shape, no new APIs, no subprocess, no new dependencies. All existing tests apply unchanged. Backwards-compatible at the trait boundary (`EventSource::post_key`).

## What we explicitly ruled OUT for v2

- **Adopt enigo / rdev / tfc.** None solves the shift problem on AVD. enigo's `text()` API also doesn't translate `\n` to Return key. Bringing in a heavyweight cross-platform dep without a payoff would be a bad trade.
- **Switch to `setFlags(maskShift)` (KeePassXC pattern).** Confirmed catastrophic on AVD — RDP strips `CGEventFlags`. The existing `lessons.md` 2026-04-20 note was correct.
- **Switch tap location to `kCGHIDEventTap`.** Doesn't fix anything on its own. enigo posts to HID and still fails on AVD because flag-on-char is the underlying issue.
- **Use AppleScript `keystroke` as the primary path.** Fast at small scale but loses ~50% of input on AVD at 15k chars regardless of throttling. RDP buffer overflow.
- **Tune `MOD_HOLD_MS` higher.** Counterintuitively *worsens* shift-drops with the broken Combined source — longer hold gives the modifier state more time to desync.
- **Add OCR-side fold band-aids for shift-drop confusions.** Earlier work added folds like `; ↔ : ↔ . ↔ ,` and `$ ↔ #` to mask the shift-drop pattern. Now obsolete — fix the cause, not the symptom. Those folds were already reverted before poc2 began.

## What we DEFERRED

- **Cross-platform.** Method A is macOS-specific (Core Graphics). Linux (xdotool/ydotool) and Windows (`SendInput`) require separate research rounds. Out of v2 scope.
- **Karabiner-DriverKit-VirtualHIDDevice.** Was the escape hatch if no CGEvent variant survived RDP. Not needed — Method A works.
- **Stress on other RDP/VDI clients** (Citrix, VMware Horizon, Parallels). All Phase B AVD testing was against Microsoft Windows App. Worth re-running poc2 5a-style probes on alternative clients in a future round.
- **Phase E speed-floor refinement.** Found 7ms floor on AVD via Windows App. Other clients may need different. Production stays at 10ms for safety.

## How to reproduce

```sh
cd poc2/typer2
cargo build --release

# Method A baseline (1 short run, eyeball)
./target/release/typer2 local \
    --file ../samples/shift_heavy.txt \
    --countdown 5 \
    --method sandwich \
    --source private

# Method A stress (15k chars)
./target/release/typer2 local \
    --file ../samples/stress_15k.txt \
    --countdown 5 \
    --method sandwich \
    --source private

# Score against source
./target/release/typer2 score \
    --sent ../samples/stress_15k.txt \
    --seen <focused-editor-saved-output.txt>
```

The poc2 `typer2` crate is excluded from the workspace ([`Cargo.toml`](../Cargo.toml)) and links `typer-core` read-only. Nothing in `poc2/` is part of the shipped product.

## Cross-references

- Live tracker for the experiments: [`poc2/plan.md`](../poc2/plan.md)
- Method survey research: [`poc2/methods.md`](../poc2/methods.md)
- Generated stress corpus: [`poc2/samples/stress_15k.txt`](../poc2/samples/stress_15k.txt)
- AVD comparator (runs inside AVD): [`poc2/avd/compare_runs.py`](../poc2/avd/compare_runs.py)
- AVD screenshots (gitignored): `poc2/screenshots/` (operator-local)
