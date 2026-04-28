#!/usr/bin/env bash
# poc2 06 — Method A at max speed on local TextEdit.
#
# All timing knobs at 0. Tunable via env vars:
#   MOD=0 EV=0 CH=0 ./poc2/scripts/06-local-fast.sh
#
# Output: poc2/results/speed-fast.txt (already empty, open it in TextEdit first)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SAMPLE="$ROOT/poc2/samples/stress_15k.txt"
OUTFILE="$ROOT/poc2/results/speed-fast.txt"

MOD="${MOD:-0}"
EV="${EV:-0}"
CH="${CH:-0}"

cd "$ROOT/poc2/typer2"
echo "=== build ==="
cargo build --release 2>&1 | tail -3
BIN="$ROOT/poc2/typer2/target/release/typer2"

cat <<EOF

=== poc2 / 06 — local max-speed test ===

knobs:  mod_hold_ms=$MOD  event_pause_ms=$EV  char_pause_ms=$CH
sample: $SAMPLE
output: $OUTFILE  (open this in TextEdit and focus it before pressing Enter)

Press Enter when TextEdit is focused on $OUTFILE.
EOF
read -r _

"$BIN" local \
    --file "$SAMPLE" \
    --countdown 5 \
    --method sandwich \
    --source private \
    --mod-hold-ms "$MOD" \
    --event-pause-ms "$EV" \
    --char-pause-ms "$CH"

cat <<EOF

=== done. Cmd+S in TextEdit to save. Tell me when saved. ===
EOF
