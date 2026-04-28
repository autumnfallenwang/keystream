#!/usr/bin/env bash
# poc2 experiment 02c — flags-on-char vs sandwich, single TextEdit session.
#
# Background: methods.md research shows the cliclick "shift sandwich"
# (3 separate events: shift-down, char, shift-up) may itself be the bug
# — Apple lore says CGEventPost doesn't latch modifiers between events
# anyway, so the sandwich is unnecessary and creates a timing window.
# KeePassXC uses a single CGEvent with CGEventFlagShift set on the char
# event itself.
#
# UX: focus TextEdit once, single 5s countdown. Two runs back-to-back
# with a header between. Eyeball each block for shift-drops.

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
LOG="$RESULT_DIR/02c-textedit-${STAMP}.log"

cat <<'EOF'
=== poc2 / 02c — flags-on-char vs sandwich ===

Two runs into one TextEdit doc, separated by headers:
  A) sandwich    (current Q2 cliclick recipe — control)
  B) flag-on-char (KeePassXC pattern)

Setup:
  1. Open TextEdit, Format > Make Plain Text, new empty doc.
  2. Click into the doc to focus it.
  3. Press Enter here. 5s countdown, then both runs back-to-back.
EOF
read -r _

run_method() {
    local label="$1"
    local method="$2"
    local countdown="$3"

    local hdr; hdr="$(mktemp -t poc2-02c-hdr.XXXXXX)"
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
        --method "$method" \
        2>&1 | tee -a "$LOG"
}

run_method "sandwich (control)" sandwich    5
run_method "flag-on-char"       flag-on-char 0

cat <<EOF

=== complete ===

In TextEdit, you should see two blocks separated by '===' headers.
Compare each block to poc2/samples/shift_heavy.txt and count shift-drops.

| Method        | shift-drops |
|---------------|-------------|
| sandwich      | |
| flag-on-char  | |

If flag-on-char is 0 (or much lower) → that's our v2 fix.
If both similar → the bug isn't in the shift-event ordering.
Update poc2/plan.md with the result.
EOF
