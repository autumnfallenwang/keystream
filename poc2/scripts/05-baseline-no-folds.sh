#!/usr/bin/env bash
# poc2 experiment 05 — raw signal baseline
#
# Question: with the band-aid OCR folds we added 2026-04-27 reverted
# (they're already gone in main), what does the raw-signal failure rate
# look like against AVD?
#
# This is just a chunked run with default settings — but typer-core's
# fold table is now back to its pre-2026-04-27 form (no `; ↔ : ↔ . ↔ ,`,
# no `$ ↔ #`). So shift_drops vs char_diffs ratios reflect the un-masked
# truth.
#
# Sample: code_corpus.txt (the actual stress sample, 29 lines).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
OCR_BIN="${OCR_HELPER:-$ROOT/src-tauri/binaries/ocr_helper-aarch64-apple-darwin}"
SAMPLE="$ROOT/docs/poc/samples/code_corpus.txt"
LOG="$RESULT_DIR/05-baseline-${STAMP}.log"

if [ ! -x "$OCR_BIN" ]; then
    echo "ocr_helper not found at $OCR_BIN" >&2
    exit 1
fi

cd "$ROOT/poc2/typer2"
echo "=== build (release) ==="
cargo build --release 2>&1 | tail -3

BIN="$ROOT/poc2/typer2/target/release/typer2"

cat <<EOF
=== poc2 / 05 — raw-signal baseline ===

Sample: docs/poc/samples/code_corpus.txt (29 lines, 916 chars)
All defaults. typer-core's fold table is back to pre-2026-04-27
(no \`; ↔ . ↔ , ↔ :\` or \`$ ↔ #\` band-aids).

Setup:
  1. Empty Notepad, AVD focused, region calibrated
  2. Press Enter when ready.
EOF
read -r _

"$BIN" chunked \
    --file "$SAMPLE" \
    --ocr "$OCR_BIN" \
    --countdown 5 \
    2>&1 | tee "$LOG"

cat <<EOF

=== complete ===
Log: $LOG

Read the summary at the end of the log. Compare to the 2026-04-27
live-AVD smoke result (which had band-aids active). The expected
shape:
  - Total char_diffs: similar or slightly higher than before (band-aids were hiding some)
  - shift_drops: a subset of char_diffs

If shift_drops is e.g. 30/40 of total diffs, that confirms the
v2-direction.md hypothesis: most "verify failures" are shift-drops,
and OCR noise is a smaller residual.
EOF
