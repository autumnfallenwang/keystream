#!/usr/bin/env bash
# poc2 experiment 02d — sandwich + HID tap location.
#
# Background: 02c2 showed flag-on-char hits 0 drops. 02d isolates
# whether *just* moving the tap location from Session to HID (keeping
# the sandwich event shape) is enough to fix sandwich. enigo posts
# exclusively to HID-tap.
#
# 3 back-to-back runs to get statistical signal (sandwich drops ~1%,
# so 1 clean run is luck; 3 clean runs is meaningful).

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
LOG="$RESULT_DIR/02d-textedit-${STAMP}.log"

cat <<'EOF'
=== poc2 / 02d — sandwich + HID tap (3 runs) ===

Method: sandwich (current Q2 cliclick recipe)
Tap:    HID  (instead of Session — enigo's choice)
Source: Combined  (default)

Setup:
  1. Open TextEdit, Format > Make Plain Text, new empty doc.
  2. Click into the doc to focus it.
  3. Press Enter here. 5s countdown, then 3 runs back-to-back.
EOF
read -r _

run_with_header() {
    local label="$1"
    local countdown="$2"

    local hdr; hdr="$(mktemp -t poc2-02d-hdr.XXXXXX)"
    {
        echo ""
        echo "=== ${label} ==="
        echo ""
    } > "$hdr"

    "$BIN" local \
        --file "$hdr" \
        --countdown "$countdown" \
        --method sandwich \
        --tap session \
        2>&1 | tee -a "$LOG"
    rm -f "$hdr"

    "$BIN" local \
        --file "$SAMPLE" \
        --countdown 0 \
        --method sandwich \
        --tap hid \
        2>&1 | tee -a "$LOG"
}

run_with_header "sandwich+hid run 1" 5
run_with_header "sandwich+hid run 2" 0
run_with_header "sandwich+hid run 3" 0

cat <<EOF

=== complete ===

Compare each block to poc2/samples/shift_heavy.txt and count drops.

| Run | shift-drops |
|---|---|
| 1 | |
| 2 | |
| 3 | |

If all 3 = 0  → HID tap alone fixes sandwich (smallest possible change).
If similar to baseline → tap location isn't the magic; flag-on-char wins.

(Note: headers are typed via sandwich+session-tap so the test data is
clean — only the body lines below each header use HID tap.)
Update poc2/plan.md with the result.
EOF
