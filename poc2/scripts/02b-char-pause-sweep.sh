#!/usr/bin/env bash
# poc2 experiment 02b — sweep CHAR_PAUSE_MS, single TextEdit session.
#
# Background: 02 showed bumping MOD_HOLD_MS made shift-drops WORSE.
# This sweeps per-char pause at fixed MOD_HOLD_MS=10. If drops scale
# down with longer pause, the bug is event-queue saturation.
#
# UX: focus TextEdit once, single 5s countdown. The script does all
# 4 runs back-to-back, separated by a header line so you can tell
# them apart. After the run, Cmd+S to save the doc.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
SAMPLE="$ROOT/poc2/samples/shift_heavy.txt"

cd "$ROOT/poc2/typer2"
echo "=== build (release) ==="
cargo build --release 2>&1 | tail -3

BIN="$ROOT/poc2/typer2/target/release/typer2"

# Build the combined file: header + sample, repeated for each value.
COMBINED="$(mktemp -t poc2-02b.XXXXXX)"
trap 'rm -f "$COMBINED"' EXIT

VALUES=(0 10 30 50)
for PAUSE in "${VALUES[@]}"; do
    {
        echo ""
        echo "=== char-pause ${PAUSE}ms ==="
        echo ""
        cat "$SAMPLE"
        echo ""
    } >> "$COMBINED"
done

cat <<EOF
=== poc2 / 02b — CHAR_PAUSE_MS sweep, single session ===

Held constant: MOD_HOLD_MS=10
Sweep values: 0, 10, 30, 50 ms (in this order)
Output: 4 runs back-to-back into TextEdit, separated by headers.

Note: this script runs each value as a SEPARATE typer2 invocation
(so we can vary --char-pause-ms per run), but only the FIRST run
has the 5s countdown. Between runs, no countdown — just keep
TextEdit focused.

Setup:
  1. Open TextEdit, Format > Make Plain Text, new empty doc.
  2. Click into the doc to focus it.
  3. Press Enter here. 5s countdown, then 4 runs back-to-back.
EOF
read -r _

LOG="$RESULT_DIR/02b-textedit-${STAMP}.log"

for i in "${!VALUES[@]}"; do
    PAUSE="${VALUES[$i]}"
    HEADER="$(mktemp -t poc2-02b-hdr.XXXXXX)"
    {
        echo ""
        echo "=== char-pause ${PAUSE}ms ==="
        echo ""
    } > "$HEADER"

    if [ "$i" -eq 0 ]; then
        COUNTDOWN=5
    else
        COUNTDOWN=0
    fi

    # Type the header (no shifted chars, immune to the bug we're testing).
    "$BIN" local \
        --file "$HEADER" \
        --countdown "$COUNTDOWN" \
        --mod-hold-ms 10 \
        --char-pause-ms 0 \
        2>&1 | tee -a "$LOG"

    rm -f "$HEADER"

    # Type the sample at the swept char-pause value.
    "$BIN" local \
        --file "$SAMPLE" \
        --countdown 0 \
        --mod-hold-ms 10 \
        --char-pause-ms "$PAUSE" \
        2>&1 | tee -a "$LOG"
done

cat <<EOF

=== sweep complete ===

In TextEdit, you should now see 4 blocks separated by '=== char-pause Nms ===' headers.

Cmd+S to save the doc somewhere if you want.

Count shift-drops per block by comparing each block to shift_heavy.txt:

| CHAR_PAUSE_MS | shift-drops |
|---|---|
| 0   | |
| 10  | |
| 30  | |
| 50  | |

If drops decrease with pause -> rate saturation (slow down to fix).
If drops stay similar -> bug isn't rate-related; look at HID tap, event source.
EOF
