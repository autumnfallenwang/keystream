#!/usr/bin/env bash
# poc2 05c — AVD STRESS: AppleScript with per-line delay throttle.
#
# 05b showed unthrottled AppleScript loses ~half the input on AVD —
# RDP can't keep up. This script adds `delay <SEC>` after every line
# in the generated AppleScript, slowing to a rate RDP can absorb.
#
# Tunable via DELAY_SEC env var. Default 0.05s (50ms between lines).
# 268 lines × 50ms = 13.4s of pure delay overhead, plus typing time.
# Estimate: ~30-60s total for a 15k corpus depending on RDP speed.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
SAMPLE="$ROOT/poc2/samples/stress_15k.txt"
LOG="$RESULT_DIR/stress-05c.log"
DELAY_SEC="${DELAY_SEC:-0.05}"

cat <<EOF

=== poc2 / 05c — AVD STRESS: AppleScript THROTTLED ===

Method: AppleScript via osascript, with delay $DELAY_SEC s after each line
Sample: stress_15k.txt (15,017 chars, 268 lines)
Tunable: DELAY_SEC env var (e.g. DELAY_SEC=0.1 ./05c-...)

Setup:
  1. Open AVD, focus a fresh empty Notepad window.
  2. Press Enter here. 5s countdown, then typing into AVD.
  3. After typing finishes, save as cN.txt inside AVD (c1, c2, c3).
  4. Repeat 3 times.
  5. In AVD: python compare_runs.py c1.txt c2.txt c3.txt

Press Enter when AVD's Notepad is focused and ready.
EOF
read -r _

for i in 5 4 3 2 1; do
    echo "starting in ${i}s..."
    sleep 1
done

SCRIPT="$(mktemp -t poc2-05c.XXXXXX).applescript"
cat > "$SCRIPT" <<APPLESCRIPT
tell application "System Events"
APPLESCRIPT

DELAY_SEC="$DELAY_SEC" python3 - "$SAMPLE" >> "$SCRIPT" <<'PY'
import os, sys
delay = os.environ.get("DELAY_SEC", "0.05")
with open(sys.argv[1]) as f:
    lines = f.read().splitlines()
for line in lines:
    esc = line.replace('\\', '\\\\').replace('"', '\\"')
    print(f'\tkeystroke "{esc}"')
    print(f'\tkey code 36')   # Return
    print(f'\tdelay {delay}')  # throttle
PY

cat >> "$SCRIPT" <<'APPLESCRIPT'
end tell
APPLESCRIPT

echo "Logging to: $LOG"
osascript "$SCRIPT" 2>&1 | tee "$LOG"
rm -f "$SCRIPT"

cat <<EOF

=== complete ===

In AVD, save as cN.txt then repeat. After 3 runs:
  python compare_runs.py c1.txt c2.txt c3.txt
EOF
