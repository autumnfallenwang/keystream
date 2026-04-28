#!/usr/bin/env bash
# poc2 00 — copy compare_runs.py into AVD via AppleScript typing.
#
# Run once before stress experiments 05a/05b. Types the python source
# into a focused AVD Notepad window so it can be saved as
# compare_runs.py inside AVD.
#
# Why AppleScript: validated (Phase B 03f) to deliver shifted chars
# correctly across RDP. Sandwich+Private also works but slower.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PY_FILE="$ROOT/poc2/avd/compare_runs.py"

if [ ! -f "$PY_FILE" ]; then
    echo "ERROR: $PY_FILE not found"
    exit 1
fi

cat <<EOF

=== poc2 / 00 — copy compare_runs.py into AVD ===

Source: $PY_FILE ($(wc -c < "$PY_FILE") bytes)

Setup:
  1. Open AVD, focus a fresh empty Notepad window.
  2. Press Enter here. 5s countdown, then typing.
  3. After typing finishes, Save As... in Notepad:
       - Filename: compare_runs.py
       - Save as type: All Files (*.*)  <- IMPORTANT, otherwise it
         appends .txt and python won't run it directly.
  4. Close Notepad.

Press Enter when AVD's Notepad is focused and ready.
EOF
read -r _

for i in 5 4 3 2 1; do
    echo "starting in ${i}s..."
    sleep 1
done

# Build osascript file: one keystroke command per source line.
SCRIPT="$(mktemp -t poc2-00.XXXXXX).applescript"
cat > "$SCRIPT" <<APPLESCRIPT
tell application "System Events"
APPLESCRIPT

python3 - "$PY_FILE" >> "$SCRIPT" <<'PY'
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

osascript "$SCRIPT"
rm -f "$SCRIPT"

cat <<EOF

=== complete ===

Now in AVD's Notepad:
  File > Save As...
  Filename: compare_runs.py
  Save as type: All Files (*.*)

Verify in AVD with:
  python compare_runs.py
  (should print usage, no syntax errors)
EOF
