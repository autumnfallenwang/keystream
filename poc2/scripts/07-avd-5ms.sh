#!/usr/bin/env bash
# poc2 07 — AVD stress at event_pause_ms=5 (local floor).
#
# Method A. One run per invocation. After typing, save Notepad doc
# as a1.txt / a2.txt / a3.txt inside AVD. Run multiple times for
# self-consistency check.
#
# After 3 runs:
#   python compare_runs.py a1.txt a2.txt a3.txt
# inside AVD.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SAMPLE="$ROOT/poc2/samples/stress_15k.txt"

cat <<'EOF'

=== poc2 / 07 — AVD STRESS at event_pause_ms=5 ===

Method:    sandwich + Private + Session
Sample:    stress_15k.txt (15,017 chars)
Knobs:     event_pause_ms=5  (vs default 10ms)

Setup:
  1. Open AVD, focus a fresh empty Notepad window.
  2. Press Enter here. 5s countdown, then typing.
  3. After typing finishes, save Notepad doc as aN.txt in AVD
     (a1.txt for first run, a2.txt for second, etc).
  4. Clear Notepad before next run.

Press Enter when AVD's Notepad is focused and ready.
EOF
read -r _

"$ROOT/poc2/typer2/target/release/typer2" local \
    --file "$SAMPLE" \
    --countdown 5 \
    --method sandwich \
    --source private \
    --event-pause-ms 5

cat <<'EOF'

=== done. Save Notepad as aN.txt in AVD. ===

After 3+ runs, in AVD:
  python compare_runs.py a1.txt a2.txt a3.txt
EOF
