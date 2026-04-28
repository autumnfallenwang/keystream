#!/usr/bin/env bash
# poc2 experiment 02h — flag-on-char + HID tap + Private source.
#
# Final matrix data point. This is enigo's exact configuration on
# macOS. Expected: 0/750.

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
LOG="$RESULT_DIR/02h-textedit-${STAMP}.log"

cat <<'EOF'
=== poc2 / 02h — full stack (3 runs) ===

Method: flag-on-char
Tap:    HID
Source: Private

This is enigo's exact macOS config. Should be rock solid.

Setup:
  1. Open TextEdit, Format > Make Plain Text, new empty doc.
  2. Click into the doc to focus it.
  3. Press Enter. 5s countdown, then 3 runs back-to-back.
EOF
read -r _

run_with_header() {
    local label="$1"
    local countdown="$2"

    local hdr; hdr="$(mktemp -t poc2-02h-hdr.XXXXXX)"
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
        --tap hid \
        --source private \
        2>&1 | tee -a "$LOG"
}

run_with_header "full-stack run 1" 5
run_with_header "full-stack run 2" 0
run_with_header "full-stack run 3" 0

cat <<EOF

=== complete ===

| Run | shift-drops |
|---|---|
| 1 | |
| 2 | |
| 3 | |

Update poc2/plan.md.
EOF
