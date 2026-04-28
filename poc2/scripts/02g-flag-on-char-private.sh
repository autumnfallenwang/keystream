#!/usr/bin/env bash
# poc2 experiment 02g — flag-on-char + Private source.
#
# Background: 02c2 = flag-on-char + Session/Combined = 0/750.
#             02e  = sandwich + Session/Private = 0/750.
# Stacking: flag-on-char + Session/Private. Should also be 0; useful
# matrix completion.
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
LOG="$RESULT_DIR/02g-textedit-${STAMP}.log"

cat <<'EOF'
=== poc2 / 02g — flag-on-char + Private source (3 runs) ===

Method: flag-on-char
Tap:    Session  (default)
Source: Private  (instead of Combined)

Setup:
  1. Open TextEdit, Format > Make Plain Text, new empty doc.
  2. Click into the doc to focus it.
  3. Press Enter. 5s countdown, then 3 runs back-to-back.
EOF
read -r _

run_with_header() {
    local label="$1"
    local countdown="$2"

    local hdr; hdr="$(mktemp -t poc2-02g-hdr.XXXXXX)"
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
        --source private \
        2>&1 | tee -a "$LOG"
}

run_with_header "flag-on-char+private run 1" 5
run_with_header "flag-on-char+private run 2" 0
run_with_header "flag-on-char+private run 3" 0

cat <<EOF

=== complete ===

| Run | shift-drops |
|---|---|
| 1 | |
| 2 | |
| 3 | |

Update poc2/plan.md.
EOF
