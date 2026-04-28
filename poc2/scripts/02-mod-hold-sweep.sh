#!/usr/bin/env bash
# poc2 experiment 02 — sweep MOD_HOLD_MS against LOCAL TextEdit
#
# Background: experiment 01 showed shift-drops happen against local
# TextEdit too (no AVD, no RDP). So the bug is on our side: the gap
# between shift-down and char-down is too short for macOS itself.
#
# This script types shift_heavy.txt into TextEdit four times with
# different MOD_HOLD_MS values. Operator visually inspects after each
# run and counts shift-drops manually.
#
# Procedure:
#   1. Open TextEdit (Format > Make Plain Text), make a new doc.
#   2. Run script. Between sweep values, you'll be asked to clear
#      TextEdit (Cmd+A, Delete) and re-focus the window.
#   3. After each run, eyeball the typed text against shift_heavy.txt
#      and note shift-drops.

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

cat <<'EOF'
=== poc2 / 02 — MOD_HOLD_MS sweep against TextEdit ===

Sweep values: 10ms, 30ms, 50ms, 100ms
Sample: shift_heavy.txt (10 lines, lots of shifted chars)
Target: TextEdit (no OCR; you eyeball the result)

Setup before each sweep value:
  1. TextEdit focused, doc EMPTY (Cmd+A, Delete)
  2. Press Enter to start that sweep value
EOF

for HOLD in 10 30 50 100; do
    LOG="$RESULT_DIR/02-textedit-${HOLD}ms-${STAMP}.log"
    cat <<EOF

==========================================
Sweep value: MOD_HOLD_MS = ${HOLD}ms
Logging to: $LOG

Clear TextEdit (Cmd+A, Delete), focus TextEdit, then press Enter.
EOF
    read -r _
    "$BIN" local \
        --file "$SAMPLE" \
        --countdown 5 \
        --mod-hold-ms "$HOLD" \
        2>&1 | tee "$LOG"

    cat <<EOF

>>> Eyeball the TextEdit window. Count shift-drops vs shift_heavy.txt.
    Common drops: ( -> 9, ) -> 0, Q -> q, : -> ;, { -> [, } -> ]
>>> Press Enter when ready for the next sweep value.
EOF
    read -r _
done

cat <<EOF

=== sweep complete ===
Logs (typer2 output) in: $RESULT_DIR/02-textedit-*-${STAMP}.log

Fill in by inspecting TextEdit between each run:

| MOD_HOLD_MS | shift-drops observed |
|---|---|
| 10  | |
| 30  | |
| 50  | |
| 100 | |

If e.g. 30ms or 50ms hits 0, that's the fix — bump MOD_HOLD_MS in
typer-core/src/config.rs.
EOF
