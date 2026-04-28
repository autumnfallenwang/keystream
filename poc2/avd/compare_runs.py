#!/usr/bin/env python3
"""Pairwise comparator for AVD stress runs.

Runs INSIDE AVD (Windows). Stdlib only — works on stock Python 3 install.

Usage:
    python compare_runs.py run1.txt run2.txt run3.txt run4.txt run5.txt

What it does:
    1. Reads N files (must all be same length, or we report a length warning).
    2. Reports basic stats: chars, lines, bytes per file.
    3. Pairwise byte-equality matrix — which runs match each other.
    4. For non-matching pairs, reports the first 5 divergent character
       positions with surrounding context.
    5. Computes a "self-consistency error rate":
         total_diff_chars / (N_pairs * chars_per_run)
       — gives an estimate of how often any given char came out wrong.

The logic: if ALL pairs match, the method is deterministic on this VM
and the estimated error rate is 0. If they differ, the *position* of
divergence usually tells you whether it's a shift-drop (the seen char
matches the unshifted base of the sent char) or some other failure mode.

Doesn't need the original sample — pure self-consistency check.
"""

from __future__ import annotations

import sys
from pathlib import Path
from itertools import combinations


# Same shift-drop map as in poc2/typer2/src/shift_drop.rs.
SHIFT_DROP = {
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
    '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
    '_': '-', '+': '=', '{': '[', '}': ']', ':': ';',
    '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
    '|': '\\',
}
def _is_shift_drop(sent: str, seen: str) -> bool:
    if sent in SHIFT_DROP and seen == SHIFT_DROP[sent]:
        return True
    if sent.isupper() and seen == sent.lower():
        return True
    return False


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("usage: python compare_runs.py file1.txt file2.txt [file3.txt ...]")
        return 2

    paths = [Path(p) for p in argv[1:]]
    contents: list[str] = []
    print("=" * 60)
    print("file stats:")
    for p in paths:
        if not p.exists():
            print(f"  ERROR: {p} not found")
            return 1
        text = p.read_text(encoding="utf-8", errors="replace")
        contents.append(text)
        print(f"  {p.name}: chars={len(text)} lines={text.count(chr(10)) + 1} bytes={p.stat().st_size}")

    n = len(contents)
    print()
    print("=" * 60)
    print(f"pairwise comparisons ({n} files, {n * (n-1) // 2} pairs):")
    print()

    total_diffs = 0
    total_chars_compared = 0
    total_shift_drop_diffs = 0
    pair_count = 0
    matching_pairs = 0

    for i, j in combinations(range(n), 2):
        a, b = contents[i], contents[j]
        an, bn = paths[i].name, paths[j].name
        pair_count += 1

        if a == b:
            matching_pairs += 1
            print(f"  {an} == {bn}: IDENTICAL")
            total_chars_compared += len(a)
            continue

        # Compare position-by-position over the overlap.
        m = min(len(a), len(b))
        diffs: list[tuple[int, str, str]] = []
        for k in range(m):
            if a[k] != b[k]:
                diffs.append((k, a[k], b[k]))
        # Length difference adds to diff count.
        len_diff = abs(len(a) - len(b))
        diff_count = len(diffs) + len_diff
        total_diffs += diff_count
        total_chars_compared += max(len(a), len(b))

        sd_pairs = sum(
            1 for _, ca, cb in diffs
            if _is_shift_drop(ca, cb) or _is_shift_drop(cb, ca)
        )
        total_shift_drop_diffs += sd_pairs

        print(f"  {an} != {bn}: {diff_count} char diffs ({sd_pairs} look like shift-drops, len_diff={len_diff})")
        # Show first 5 divergences with context.
        for k, ca, cb in diffs[:5]:
            ctx_start = max(0, k - 10)
            ctx_end = min(m, k + 11)
            ca_repr = repr(ca)
            cb_repr = repr(cb)
            sd = " (SHIFT-DROP)" if _is_shift_drop(ca, cb) or _is_shift_drop(cb, ca) else ""
            ctx_a = a[ctx_start:k] + "[" + ca + "]" + a[k+1:ctx_end]
            ctx_b = b[ctx_start:k] + "[" + cb + "]" + b[k+1:ctx_end]
            print(f"    pos {k}: {ca_repr} vs {cb_repr}{sd}")
            print(f"      A: ...{ctx_a!r}...")
            print(f"      B: ...{ctx_b!r}...")
        if len(diffs) > 5:
            print(f"    ... {len(diffs) - 5} more diffs")

    print()
    print("=" * 60)
    print("summary:")
    print(f"  pairs:                {pair_count}")
    print(f"  identical pairs:      {matching_pairs} / {pair_count}")
    print(f"  total char diffs:     {total_diffs}")
    print(f"  shift-drop-like:      {total_shift_drop_diffs}")
    print(f"  total chars compared: {total_chars_compared}")
    if total_chars_compared > 0:
        rate = 100.0 * total_diffs / total_chars_compared
        print(f"  estimated error rate: {rate:.4f}% ({total_diffs}/{total_chars_compared})")
        if total_diffs > 0:
            sd_pct = 100.0 * total_shift_drop_diffs / total_diffs
            print(f"  shift-drops as % of diffs: {sd_pct:.1f}%")
    print()
    if matching_pairs == pair_count:
        print("VERDICT: all runs identical -> method is deterministic on this VM (estimated error rate ~0).")
    else:
        print("VERDICT: runs diverge -> method has nonzero error rate (see above).")
        print("  shift-drop-heavy diffs -> RDP/modifier issue")
        print("  random diffs           -> different bug (timing, OS noise)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
