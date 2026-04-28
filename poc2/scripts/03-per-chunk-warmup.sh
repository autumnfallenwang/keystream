#!/usr/bin/env bash
# poc2 experiment 03 — re-warmup shift before every chunk
#
# Question: Q3 warms up shift once at session start. Does re-warming up
# before EVERY chunk eliminate mid-run shift-drops?
#
# Procedure:
#   Two runs against the same sample, one without per-chunk rewarmup
#   (control), one with. Compare shift_drops counts.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESULT_DIR="$ROOT/poc2/results"
mkdir -p "$RESULT_DIR"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
OCR_BIN="${OCR_HELPER:-$ROOT/src-tauri/binaries/ocr_helper-aarch64-apple-darwin}"
SAMPLE="$ROOT/poc2/samples/shift_heavy.txt"

if [ ! -x "$OCR_BIN" ]; then
    echo "ocr_helper not found at $OCR_BIN" >&2
    exit 1
fi

cd "$ROOT/poc2/typer2"
echo "=== build (release) ==="
cargo build --release 2>&1 | tail -3

BIN="$ROOT/poc2/typer2/target/release/typer2"

run_chunked() {
    local label="$1"
    local extra="$2"
    local log="$RESULT_DIR/03-${label}-${STAMP}.log"

    cat <<EOF

==========================================
Run: $label
Extra args: $extra
Logging to: $log

Clear Notepad, focus AVD, press Enter.
EOF
    read -r _
    # shellcheck disable=SC2086  # intentional word-splitting of $extra
    "$BIN" chunked \
        --file "$SAMPLE" \
        --ocr "$OCR_BIN" \
        --countdown 5 \
        --mod-hold-ms 10 \
        $extra 2>&1 | tee "$log"
}

cat <<'EOF'
=== poc2 / 03 — per-chunk rewarmup ===

Two runs:
  A) control: warmup once (current Q3 behavior)
  B) experimental: --rewarmup-per-chunk

Compare shift_drops in summary lines.
EOF

run_chunked "control"     ""
run_chunked "rewarmup"    "--rewarmup-per-chunk"

cat <<EOF

=== complete ===
Compare shift_drops between the two logs.
Append finding to poc2/results/findings.md.
EOF
