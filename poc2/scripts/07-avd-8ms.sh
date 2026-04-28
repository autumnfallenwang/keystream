#!/usr/bin/env bash
# poc2 07 — AVD stress at event_pause_ms=8.
# Save Notepad as d1.txt / d2.txt / d3.txt in AVD between runs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cat <<'EOF'
=== poc2 / 07 — AVD at event_pause_ms=8 ===
Focus empty Notepad in AVD, press Enter, save as dN.txt after.
EOF
read -r _
"$ROOT/poc2/typer2/target/release/typer2" local \
    --file "$ROOT/poc2/samples/stress_15k.txt" \
    --countdown 5 --method sandwich --source private --event-pause-ms 8
echo "=== done. Save Notepad as dN.txt ==="
