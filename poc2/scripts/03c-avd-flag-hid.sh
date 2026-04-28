#!/usr/bin/env bash
# poc2 03c — AVD: flag-on-char + Combined + HID tap.
# Theory: HID tap might bypass whatever strips the flag in 03b. Likely not.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"; mkdir -p "$RESULT_DIR"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
SAMPLE="$ROOT/poc2/samples/shift_heavy.txt"
cd "$ROOT/poc2/typer2" && cargo build --release 2>&1 | tail -3
BIN="$ROOT/poc2/typer2/target/release/typer2"
LOG="$RESULT_DIR/03c-avd-${STAMP}.log"

cat <<'EOF'
=== poc2 / 03c — AVD: flag-on-char + Combined + HID ===
Setup: focus AVD Notepad (empty). Press Enter. 5s, then 1 run. Screenshot after.
EOF
read -r _

"$BIN" local --file "$SAMPLE" --countdown 5 \
    --method flag-on-char --tap hid 2>&1 | tee "$LOG"

echo
echo "=== complete. Screenshot AVD and share. ==="
