#!/usr/bin/env bash
# poc2 04a — stress test method A (sandwich + Private) on local TextEdit.
#
# Types stress_15k.txt (15,017 chars, ~10 min at 25 ch/s) into a fresh
# empty TextEdit doc. After typing, you Cmd+S to save. Then we score.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
SAMPLE="$ROOT/poc2/samples/stress_15k.txt"
OUTFILE="$RESULT_DIR/stress-04a.txt"

cd "$ROOT/poc2/typer2"
echo "=== build (release) ==="
cargo build --release 2>&1 | tail -3

BIN="$ROOT/poc2/typer2/target/release/typer2"

cat <<EOF

=== poc2 / 04a — STRESS: sandwich + Private (local TextEdit) ===

Method: sandwich (Q2 cliclick recipe)
Source: Private  (Phase A winner)
Sample: stress_15k.txt (15,017 chars, ~10 min at 25 ch/s)
Output: $OUTFILE  (open this in TextEdit yourself first)

Setup:
  1. Open $OUTFILE in TextEdit and click into the window so it has focus.
  2. Press Enter here. 5s countdown, then typing begins.
  3. After ~10 minutes typing finishes. Cmd+S in TextEdit to save.
  4. Tell me when saved — I'll score the file.

Press Enter when TextEdit is focused and ready.
EOF
read -r _

"$BIN" local \
    --file "$SAMPLE" \
    --countdown 5 \
    --method sandwich \
    --source private \
    2>&1 | tee "$RESULT_DIR/stress-04a.log"

cat <<EOF

=== complete ===

1. Cmd+S in TextEdit to save the result.
2. Tell me when saved.

Output file: $OUTFILE
Source:      $SAMPLE

I'll then run:
  typer2 score --sent $SAMPLE --seen $OUTFILE
  diff -u $SAMPLE $OUTFILE
EOF
