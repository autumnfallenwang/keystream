#!/usr/bin/env bash
# poc2 experiment 01 — local TextEdit smoke
#
# Question: Is the shift-drop bug an AVD/RDP issue, or does it happen
# when typing into a local Mac editor too?
#
# Procedure:
#   1. Open TextEdit (plain text mode), make a new empty doc.
#   2. Run this script. It counts down 5s, then types shift_heavy.txt
#      into whatever has focus.
#   3. After typing, visually inspect the TextEdit window:
#      - Did `(`, `)`, `Q`, `:`, `~` etc. land correctly?
#      - Or did some appear as `9`, `0`, `q`, `;`, `` ` ``?
#
# Expected outcomes:
#   - 0 shift-drops in TextEdit  → bug is RDP-side; experiments 02-04
#                                    target the RDP boundary
#   - >0 shift-drops in TextEdit → bug is our side; experiment 02
#                                    (mod-hold sweep) is the fix path

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
LOG="$RESULT_DIR/01-local-textedit-$(date +%Y-%m-%d-%H%M%S).log"

cat <<'EOF'
=== poc2 / 01 — local TextEdit smoke ===

What this does:
  Types poc2/samples/shift_heavy.txt into the focused window.

Setup before continuing:
  1. Open TextEdit > File > New (plain text mode: Format > Make Plain Text)
  2. Click into the empty TextEdit window so it has focus
  3. Come back here and press Enter

After typing, look at TextEdit and compare to poc2/samples/shift_heavy.txt:
  - Every `(` should be `(`, not `9`
  - Every uppercase `Q` should be `Q`, not `q`
  - Every `:` should be `:`, not `;`
  ...etc.

Press Enter when TextEdit is focused and ready. (Ctrl-C to abort.)
EOF
read -r _

echo "Logging to: $LOG"
echo "=== build (release) ==="
cd "$ROOT/poc2/typer2"
cargo build --release 2>&1 | tail -5

echo
echo "=== running typer2 local ===" | tee -a "$LOG"
"$ROOT/poc2/typer2/target/release/typer2" local \
    --file "$ROOT/poc2/samples/shift_heavy.txt" \
    --countdown 5 \
    2>&1 | tee -a "$LOG"

cat <<EOF | tee -a "$LOG"

=== record your finding ===
After visual inspection, append to poc2/results/findings.md:

## 01 local-textedit — $(date +%Y-%m-%d)
Target: TextEdit plain-text
Sample: shift_heavy.txt (~10 lines, every line has shifted chars)
Shift-drops observed: ___ / ___ shifted chars
Conclusion: ___

EOF
