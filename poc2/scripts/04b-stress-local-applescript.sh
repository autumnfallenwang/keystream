#!/usr/bin/env bash
# poc2 04b — stress test method B (AppleScript) on local TextEdit.
#
# Types stress_15k.txt into a fresh TextEdit doc via osascript.
# After typing, Cmd+S to save. We score.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
SAMPLE="$ROOT/poc2/samples/stress_15k.txt"
OUTFILE="$RESULT_DIR/stress-04b.txt"

cat <<EOF

=== poc2 / 04b — STRESS: AppleScript keystroke (local TextEdit) ===

Method: AppleScript via osascript
Sample: stress_15k.txt (15,017 chars)
Output: $OUTFILE  (open this in TextEdit yourself first)

Setup:
  1. Open $OUTFILE in TextEdit and click into the window so it has focus.
  2. Press Enter here. 5s countdown, then typing begins.
  3. After typing finishes, Cmd+S in TextEdit to save.
  4. Tell me when saved.

Note: AppleScript may need Terminal Accessibility permission.

Press Enter when TextEdit is focused and ready.
EOF
read -r _

for i in 5 4 3 2 1; do
    echo "starting in ${i}s..."
    sleep 1
done

# Build osascript file: one keystroke command per line, key code 36 between.
SCRIPT="$(mktemp -t poc2-04b.XXXXXX).applescript"
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

LOG="$RESULT_DIR/stress-04b.log"
echo "Logging to: $LOG"
echo "Running osascript..."
osascript "$SCRIPT" 2>&1 | tee "$LOG"
rm -f "$SCRIPT"

cat <<EOF

=== complete ===

1. Cmd+S in TextEdit to save.
2. Tell me when saved.

Output file: $OUTFILE
Source:      $SAMPLE

I'll then run:
  typer2 score --sent $SAMPLE --seen $OUTFILE
  diff -u $SAMPLE $OUTFILE
EOF
