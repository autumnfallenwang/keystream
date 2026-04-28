#!/usr/bin/env bash
# poc2 experiment 03b — AVD: flag-on-char + Combined + Session.
#
# Phase B continuation. Validates the flag-on-char Phase A winner
# (probe 02c2) against AVD. No OCR — operator screenshots AVD.

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
LOG="$RESULT_DIR/03b-avd-flag-on-char-${STAMP}.log"

cat <<'EOF'
=== poc2 / 03b — AVD: flag-on-char + Combined + Session ===

Method: flag-on-char (KeePassXC pattern)
Tap:    Session  (default)
Source: Combined (default)

Setup:
  1. Open AVD, focus Notepad. Make sure it's empty.
  2. Click into AVD's Notepad so it has focus.
  3. Press Enter. 5s countdown, then 3 runs back-to-back.
  4. Screenshot AVD when done, share back.
EOF
read -r _

run_with_header() {
    local label="$1"
    local countdown="$2"

    local hdr; hdr="$(mktemp -t poc2-03b-hdr.XXXXXX)"
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
        --method flag-on-char \
        2>&1 | tee -a "$LOG"
}

run_with_header "AVD flag-on-char run 1" 5
run_with_header "AVD flag-on-char run 2" 0
run_with_header "AVD flag-on-char run 3" 0

cat <<EOF

=== complete ===

Screenshot AVD Notepad and share.
Update poc2/plan.md with the result.
EOF
