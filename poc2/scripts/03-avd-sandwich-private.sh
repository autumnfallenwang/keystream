#!/usr/bin/env bash
# poc2 experiment 03 — AVD validation: sandwich + Private source.
#
# Background: Phase A locked sandwich+Private as the smallest-change
# fix for shift-drops on local TextEdit. This validates it survives
# the RDP hop into AVD.
#
# UX: same as Phase A — focus AVD's Notepad once, single 5s countdown,
# script types the sample. NO OCR. Operator screenshots AVD afterward
# and shares the image to count drops.

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
LOG="$RESULT_DIR/03-avd-sandwich-private-${STAMP}.log"

cat <<'EOF'
=== poc2 / 03 — AVD: sandwich + Private source ===

Method: sandwich (current Q2 cliclick recipe)
Tap:    Session  (default)
Source: Private  (Phase A winner)

Setup:
  1. Open AVD, focus Notepad (or whatever editor), make sure it's empty.
  2. Click into AVD's editor so it has keyboard focus.
  3. Press Enter here. 5s countdown, then sample types into AVD.
  4. After typing finishes, screenshot AVD and share back.

Sample: shift_heavy.txt (~250 chars, lots of shifted chars)

Press Enter when AVD is focused and ready.
EOF
read -r _

run_with_header() {
    local label="$1"
    local countdown="$2"

    local hdr; hdr="$(mktemp -t poc2-03-hdr.XXXXXX)"
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

run_with_header "AVD sandwich+private run 1" 5
run_with_header "AVD sandwich+private run 2" 0
run_with_header "AVD sandwich+private run 3" 0

cat <<EOF

=== complete ===

Screenshot AVD now and share back. I'll count shift-drops vs
poc2/samples/shift_heavy.txt.

Three runs back-to-back so we get statistical signal across ~750 chars.
Update poc2/plan.md with the result.
EOF
