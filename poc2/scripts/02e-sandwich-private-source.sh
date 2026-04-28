#!/usr/bin/env bash
# poc2 experiment 02e — sandwich + Private event source.
#
# Background: 02d showed HID tap alone doesn't fix sandwich. This
# tests if the *source state ID* matters: Private (independent
# modifier tracking, no inheritance from the user's physical keyboard
# state) vs Combined (default; mixes user keyboard state with our
# injected events).
#
# 3 back-to-back runs.

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
LOG="$RESULT_DIR/02e-textedit-${STAMP}.log"

cat <<'EOF'
=== poc2 / 02e — sandwich + Private source (3 runs) ===

Method: sandwich
Tap:    Session  (default)
Source: Private  (instead of Combined)

Setup:
  1. Open TextEdit, Format > Make Plain Text, new empty doc.
  2. Click into the doc to focus it.
  3. Press Enter here. 5s countdown, then 3 runs back-to-back.
EOF
read -r _

run_with_header() {
    local label="$1"
    local countdown="$2"

    local hdr; hdr="$(mktemp -t poc2-02e-hdr.XXXXXX)"
    {
        echo ""
        echo "=== ${label} ==="
        echo ""
    } > "$hdr"

    "$BIN" local \
        --file "$hdr" \
        --countdown "$countdown" \
        --method sandwich \
        2>&1 | tee -a "$LOG"
    rm -f "$hdr"

    "$BIN" local \
        --file "$SAMPLE" \
        --countdown 0 \
        --method sandwich \
        --source private \
        2>&1 | tee -a "$LOG"
}

run_with_header "sandwich+private run 1" 5
run_with_header "sandwich+private run 2" 0
run_with_header "sandwich+private run 3" 0

cat <<EOF

=== complete ===

Compare each block to poc2/samples/shift_heavy.txt and count drops.

| Run | shift-drops |
|---|---|
| 1 | |
| 2 | |
| 3 | |

If all 3 = 0  → Private source alone fixes sandwich.
If similar to 02d → source state isn't the magic either.
Update poc2/plan.md with the result.
EOF
