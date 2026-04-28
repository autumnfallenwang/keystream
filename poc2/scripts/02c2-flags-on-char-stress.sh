#!/usr/bin/env bash
# poc2 experiment 02c2 — confirm flag-on-char with 3 back-to-back runs.
#
# Background: 02c showed flag-on-char with explicit empty-flag clearing
# produced 0 shift-drops in one run. To confirm it's not luck (sandwich
# drops at ~1%, so 0 in one ~250-char run is plausible by chance),
# repeat 3 times.

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
LOG="$RESULT_DIR/02c2-textedit-${STAMP}.log"

cat <<'EOF'
=== poc2 / 02c2 — flag-on-char stress (3 runs) ===

3 back-to-back flag-on-char runs into one TextEdit doc.
~750 chars total (~250 per run, ~80 shifted chars per run).
Expected if 02c was real: 0 shift-drops across all 3 runs.

Setup:
  1. Open TextEdit, Format > Make Plain Text, new empty doc.
  2. Click into the doc to focus it.
  3. Press Enter here. 5s countdown, then 3 runs back-to-back.
EOF
read -r _

run_with_header() {
    local label="$1"
    local countdown="$2"

    local hdr; hdr="$(mktemp -t poc2-02c2-hdr.XXXXXX)"
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

run_with_header "flag-on-char run 1" 5
run_with_header "flag-on-char run 2" 0
run_with_header "flag-on-char run 3" 0

cat <<EOF

=== complete ===

Compare each block to poc2/samples/shift_heavy.txt and count drops.

| Run | shift-drops |
|---|---|
| 1 | |
| 2 | |
| 3 | |

If all 3 = 0 → flag-on-char is the v2 fix (with very high confidence).
If any > 0 → still better than sandwich, but not bulletproof.
Update poc2/plan.md with the result.
EOF
