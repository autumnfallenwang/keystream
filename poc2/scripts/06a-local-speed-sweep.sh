#!/usr/bin/env bash
# poc2 06a — speed sweep on local TextEdit, Method A (sandwich + Private).
#
# Goal: find the floor for event_pause_ms. Currently 10ms; we suspect
# Method A can go much faster without dropping chars (enigo proved
# local Mac can handle full-throttle). We sweep 10/5/2/1/0 ms, type
# the same 15k corpus into a separate output file at each speed,
# then diff each output against the source.
#
# Each sweep value writes to its own output file. Operator opens
# the next file in TextEdit between sweeps.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
SAMPLE="$ROOT/poc2/samples/stress_15k.txt"

cd "$ROOT/poc2/typer2"
echo "=== build (release) ==="
cargo build --release 2>&1 | tail -3

BIN="$ROOT/poc2/typer2/target/release/typer2"
VALUES=(10 5 2 1 0)

# Pre-create empty result files for each sweep value.
for V in "${VALUES[@]}"; do
    : > "$RESULT_DIR/speed-06a-${V}ms.txt"
done

cat <<EOF

=== poc2 / 06a — Method A speed sweep on local TextEdit ===

Sweeping event_pause_ms: 10, 5, 2, 1, 0
Sample: stress_15k.txt (15,017 chars)
Held constant: mod_hold_ms=10, char_pause_ms=0, method=sandwich, source=Private

Output files (one per sweep value, pre-created empty):
EOF
for V in "${VALUES[@]}"; do
    echo "  $RESULT_DIR/speed-06a-${V}ms.txt"
done
cat <<EOF

Setup:
  Before each sweep value, you'll be asked to:
    1. Open the corresponding speed-06a-Nms.txt in TextEdit.
    2. Click into TextEdit so it has focus.
    3. Press Enter here. 5s countdown, then typing.

EOF

for V in "${VALUES[@]}"; do
    OUTFILE="$RESULT_DIR/speed-06a-${V}ms.txt"
    cat <<EOF

==========================================
Sweep value: event_pause_ms = ${V}ms
Output:      $OUTFILE

Open $OUTFILE in TextEdit, focus, then press Enter.
EOF
    read -r _

    "$BIN" local \
        --file "$SAMPLE" \
        --countdown 5 \
        --method sandwich \
        --source private \
        --event-pause-ms "$V" \
        2>&1 | tee "$RESULT_DIR/speed-06a-${V}ms.log"

    cat <<EOF

>>> Cmd+S in TextEdit to save. Press Enter when saved.
EOF
    read -r _
done

cat <<EOF

=== sweep complete. Scoring each speed value... ===

EOF

# Score each output against the source.
for V in "${VALUES[@]}"; do
    OUTFILE="$RESULT_DIR/speed-06a-${V}ms.txt"
    SENT_CHARS=$(wc -c < "$SAMPLE")
    SEEN_CHARS=$(wc -c < "$OUTFILE")
    DIFF_LINES=$(diff "$SAMPLE" "$OUTFILE" | grep -c '^[<>]' || true)
    echo
    echo "  event_pause_ms=${V}ms"
    echo "    expected chars: $SENT_CHARS"
    echo "    got chars:      $SEEN_CHARS"
    echo "    diff lines:     $DIFF_LINES"
    "$BIN" score --sent "$SAMPLE" --seen "$OUTFILE" 2>&1 | sed 's/^/    /'
done

cat <<EOF

=== Where did it break? ===
Look at the score lines above. The lowest event_pause_ms with 0 shift_drops
is the practical floor. Pick 2x that for production safety margin.
EOF
