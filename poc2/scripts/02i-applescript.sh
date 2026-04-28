#!/usr/bin/env bash
# poc2 experiment 02i — AppleScript `keystroke` baseline.
#
# Background: AppleScript's `tell application "System Events" to
# keystroke ...` is the canonical "slow but reliable" macOS injection.
# It uses high-level AX events, not raw CGEvent. If this drops, the
# bug is somewhere far below our pay grade.
#
# Used as an EXTERNAL REFERENCE: tells us what "perfect" looks like
# and whether our 0/750 winners match it.
#
# Limitations:
#   - Slow (~25 chars/sec)
#   - Each keystroke command is one AppleScript invocation, so we
#     escape the sample as a single AppleScript string and let
#     osascript handle the typing.
#
# 1 run is enough — this method's reliability is well-established;
# we just want to confirm baseline against our local Mac.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
SAMPLE="$ROOT/poc2/samples/shift_heavy.txt"
LOG="$RESULT_DIR/02i-textedit-${STAMP}.log"

cat <<'EOF'
=== poc2 / 02i — AppleScript keystroke baseline ===

Method: AppleScript `tell application "System Events" to keystroke ...`
Speed:  ~25 chars/sec (~10s for shift_heavy.txt)
1 run only.

Setup:
  1. Open TextEdit, Format > Make Plain Text, new empty doc.
  2. Click into the doc to focus it.
  3. Press Enter. 5s countdown then typing starts.

Note: AppleScript may prompt for Accessibility permission for the
TERMINAL (not for typer2 — different binary). If it does, grant it
and re-run.
EOF
read -r _

for i in 5 4 3 2 1; do
    echo "starting in ${i}s..."
    sleep 1
done

# Read sample, escape backslashes and double quotes for AppleScript string.
ESCAPED=$(python3 -c "
import sys
with open(sys.argv[1]) as f:
    text = f.read()
# AppleScript string: backslashes and double-quotes need escaping.
text = text.replace('\\\\', '\\\\\\\\').replace('\"', '\\\\\"')
# Newlines: AppleScript 'keystroke' doesn't insert newlines on raw \n;
# split into lines and emit a 'key code 36' (return) between each.
print(text, end='')
" "$SAMPLE")

# Write a temp osascript file so we can quote-escape simply.
SCRIPT="$(mktemp -t poc2-02i.XXXXXX).applescript"
cat > "$SCRIPT" <<APPLESCRIPT
tell application "System Events"
APPLESCRIPT

# Emit one keystroke command per line; key code 36 (Return) between them.
python3 - "$SAMPLE" >> "$SCRIPT" <<'PY'
import sys
with open(sys.argv[1]) as f:
    lines = f.read().splitlines()
for i, line in enumerate(lines):
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

Compare TextEdit content against poc2/samples/shift_heavy.txt.

| AppleScript | shift-drops |
|-------------|-------------|
| 1 run       | |

Expected: 0. AppleScript is the canonical reliable injection.
If this drops, the bug is somewhere very deep.
Update poc2/plan.md.
EOF
