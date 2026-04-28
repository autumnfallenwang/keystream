#!/usr/bin/env bash
# poc2 03d — AVD: flag-on-char + Private + Session.
# Theory: Private source might encode flags differently. Likely doesn't help.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"; mkdir -p "$RESULT_DIR"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
SAMPLE="$ROOT/poc2/samples/shift_heavy.txt"
cd "$ROOT/poc2/typer2" && cargo build --release 2>&1 | tail -3
BIN="$ROOT/poc2/typer2/target/release/typer2"
LOG="$RESULT_DIR/03d-avd-${STAMP}.log"

cat <<'EOF'
=== poc2 / 03d — AVD: flag-on-char + Private + Session ===
Setup: focus AVD Notepad (empty). Press Enter. 5s, then 1 run. Screenshot after.
EOF
read -r _

"$BIN" local --file "$SAMPLE" --countdown 5 \
    --method flag-on-char --source private 2>&1 | tee "$LOG"

echo
echo "=== complete. Screenshot AVD and share. ==="
