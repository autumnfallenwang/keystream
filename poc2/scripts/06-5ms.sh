#!/usr/bin/env bash
# poc2 06 — single run at event_pause_ms=5, Method A.
# Open poc2/results/speed-5ms.txt in TextEdit and focus it before running.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
"$ROOT/poc2/typer2/target/release/typer2" local \
    --file "$ROOT/poc2/samples/stress_15k.txt" \
    --countdown 5 \
    --method sandwich \
    --source private \
    --event-pause-ms 5
echo "=== done. Cmd+S to save speed-5ms.txt ==="
