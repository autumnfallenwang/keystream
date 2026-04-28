#!/usr/bin/env bash
# poc2 experiment 03f — AVD: AppleScript `keystroke`.
#
# Phase B: validate AppleScript Phase A winner (02i) against AVD.
# AppleScript routes through AppleEvents / AX layer, not CGEvent.
# Unknown whether RDP forwards these correctly.
#
# Same approach as 02i — slow but reliable.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
SAMPLE="$ROOT/poc2/samples/shift_heavy.txt"
LOG="$RESULT_DIR/03f-avd-applescript-${STAMP}.log"

cat <<'EOF'
=== poc2 / 03f — AVD: AppleScript keystroke ===

Method: AppleScript `tell application "System Events" to keystroke ...`

Setup:
  1. Open AVD, focus Notepad. Make sure it's empty.
  2. Click into AVD's Notepad so it has focus.
  3. Press Enter. 5s countdown, then sample types.
  4. Screenshot AVD when done.

Note: AppleScript may need Terminal Accessibility permission.
EOF
read -r _

for i in 5 4 3 2 1; do
    echo "starting in ${i}s..."
    sleep 1
done

SCRIPT="$(mktemp -t poc2-03f.XXXXXX).applescript"
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
    print(f'\tkey code 36')  # Return after each line
PY

cat >> "$SCRIPT" <<'APPLESCRIPT'
end tell
APPLESCRIPT

echo "Logging to: $LOG"
echo "Running osascript..."
osascript "$SCRIPT" 2>&1 | tee "$LOG"
rm -f "$SCRIPT"

cat <<EOF

=== complete ===

Screenshot AVD and share back. Update poc2/plan.md.
EOF
