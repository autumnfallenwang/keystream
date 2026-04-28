#!/usr/bin/env bash
# poc2 05b — STRESS test method B (AppleScript) on AVD.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
SAMPLE="$ROOT/poc2/samples/stress_15k.txt"
LOG="$RESULT_DIR/stress-05b.log"

cat <<EOF

=== poc2 / 05b — AVD STRESS: AppleScript ===

Method: AppleScript via osascript
Sample: stress_15k.txt (15,017 chars; AppleScript typically ~2-3 min on AVD)

Setup:
  1. Open AVD, focus a fresh empty Notepad window.
  2. Press Enter here. 5s countdown, then typing into AVD.
  3. Save as runN.txt inside AVD when done.
  4. Repeat 4-5 times.
  5. Run compare_runs.py in AVD.

Press Enter when AVD's Notepad is focused and ready.
EOF
read -r _

for i in 5 4 3 2 1; do
    echo "starting in ${i}s..."
    sleep 1
done

SCRIPT="$(mktemp -t poc2-05b.XXXXXX).applescript"
cat > "$SCRIPT" <<APPLESCRIPT
tell application "System Events"
APPLESCRIPT

python3 - "$SAMPLE" >> "$SCRIPT" <<'PY'
import sys
with open(sys.argv[1]) as f:
    lines = f.read().splitlines()
for line in lines:
    esc = line.replace('\\', '\\\\').replace('"', '\\"')
    print(f'\tkeystroke "{esc}"')
    print(f'\tkey code 36')
PY

cat >> "$SCRIPT" <<'APPLESCRIPT'
end tell
APPLESCRIPT

echo "Logging to: $LOG"
osascript "$SCRIPT" 2>&1 | tee "$LOG"
rm -f "$SCRIPT"

cat <<EOF

=== complete ===

In AVD:
  1. Save Notepad doc as runN.txt
  2. Clear Notepad before next run.
EOF
