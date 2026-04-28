#!/usr/bin/env bash
# poc2 05a — STRESS test method A (sandwich + Private) on AVD.
#
# Types stress_15k.txt into focused AVD Notepad. Run multiple times
# (4-5), saving the Notepad output as run1.txt, run2.txt, etc inside
# AVD between runs. Then run avd/compare_runs.py inside AVD to see
# self-consistency across runs.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
SAMPLE="$ROOT/poc2/samples/stress_15k.txt"

cd "$ROOT/poc2/typer2"
echo "=== build (release) ==="
cargo build --release 2>&1 | tail -3

BIN="$ROOT/poc2/typer2/target/release/typer2"

cat <<EOF

=== poc2 / 05a — AVD STRESS: sandwich + Private ===

Method: sandwich + Private source
Sample: stress_15k.txt (15,017 chars, ~10 min at 25 ch/s)

Setup:
  1. Open AVD, focus a fresh empty Notepad window.
  2. Press Enter here. 5s countdown, then typing into AVD.
  3. After ~10 min, save Notepad doc as runN.txt (e.g. run1.txt) inside AVD.
  4. Repeat 4-5 times (re-run this script, save as run2.txt, etc).
  5. In AVD, run:
       python compare_runs.py run1.txt run2.txt run3.txt run4.txt run5.txt
     (you'll need to copy avd/compare_runs.py into AVD beforehand)

Press Enter when AVD's Notepad is focused and ready.
EOF
read -r _

"$BIN" local \
    --file "$SAMPLE" \
    --countdown 5 \
    --method sandwich \
    --source private \
    2>&1 | tee "$RESULT_DIR/stress-05a.log"

cat <<EOF

=== complete ===

In AVD:
  1. Save Notepad doc as the next run file (run1.txt, run2.txt, ...)
  2. Clear Notepad before next run.
EOF
