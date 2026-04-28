#!/usr/bin/env bash
# poc2 experiment 04 — explicit shift-up between chunks
#
# Question: if shift state desyncs between chunks (the VM thinks shift
# is held when it isn't, or vice versa), does an explicit shift-up
# event between chunks reset it cleanly?
#
# Procedure:
#   Same as 03 but the experimental arm uses --shift-up-between.

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
    local log="$RESULT_DIR/04-${label}-${STAMP}.log"

    cat <<EOF

==========================================
Run: $label
Extra args: $extra
Logging to: $log

Clear Notepad, focus AVD, press Enter.
EOF
    read -r _
    # shellcheck disable=SC2086
    "$BIN" chunked \
        --file "$SAMPLE" \
        --ocr "$OCR_BIN" \
        --countdown 5 \
        --mod-hold-ms 10 \
        $extra 2>&1 | tee "$log"
}

cat <<'EOF'
=== poc2 / 04 — shift-up between chunks ===

Two runs:
  A) control
  B) experimental: --shift-up-between
EOF

run_chunked "control"      ""
run_chunked "shift-up"     "--shift-up-between"

cat <<EOF

=== complete ===
Compare shift_drops counts. Append finding to poc2/results/findings.md.
EOF
