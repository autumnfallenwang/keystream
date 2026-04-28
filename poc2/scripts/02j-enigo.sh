#!/usr/bin/env bash
# poc2 experiment 02j — enigo crate (third-party reference).
#
# Background: enigo is a battle-tested Rust crate for cross-platform
# input synthesis. On macOS it uses HID tap + Private source +
# CGEventFlags-on-char (matching our 02h config). If our 02c2/02e/02f/
# 02g/02h winners match enigo's reliability, we know our impl is sound.
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
LOG="$RESULT_DIR/02j-textedit-${STAMP}.log"

cat <<'EOF'
=== poc2 / 02j — enigo crate (3 runs) ===

Method: enigo crate (third-party)
Config: enigo's defaults — HID tap + Private source on macOS

NOTE: enigo may need its own Accessibility permission grant for the
typer2 binary. If the first run does nothing, check System Settings.

Setup:
  1. Open TextEdit, Format > Make Plain Text, new empty doc.
  2. Click into the doc to focus it.
  3. Press Enter. 5s countdown, then 3 runs back-to-back.
EOF
read -r _

run_with_header() {
    local label="$1"
    local countdown="$2"

    local hdr; hdr="$(mktemp -t poc2-02j-hdr.XXXXXX)"
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

    "$BIN" enigo \
        --file "$SAMPLE" \
        --countdown 0 \
        2>&1 | tee -a "$LOG"
}

run_with_header "enigo run 1" 5
run_with_header "enigo run 2" 0
run_with_header "enigo run 3" 0

cat <<EOF

=== complete ===

| Run | shift-drops |
|---|---|
| 1 | |
| 2 | |
| 3 | |

If 0/750 → enigo confirms the v2 winners' shape.
If drops → enigo has its own bug we'd want to know about.
Update poc2/plan.md.
EOF
