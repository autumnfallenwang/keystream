# poc2 — input-side resilience experiments

Round 2 of the Keystream PoC. Built after the live-AVD smoke (2026-04-27)
revealed two distinct failure modes (see `docs/v2-direction.md`):

- **OCR errors** — random, unpredictable, ~1-2% per char
- **Typing errors** — 99.9% one pattern: shift-drop (`(`→`9`, `Q`→`q`, …)

This round answers questions before redesigning the verify pipeline:

1. Is the shift-drop bug an AVD/RDP issue, or does it happen against a
   local Mac target too?
2. Does increasing `mod_hold_ms` (currently 10ms) eliminate shift-drops?
3. Does re-warming up shift per chunk eliminate them?
4. Does an explicit shift-up between chunks help?
5. With OCR fold-table band-aids disabled, what does the raw signal look like?

Each experiment is a shell script in `scripts/`. They all wrap the existing
`typer` CLI (`typer-core/src/bin/typer.rs`) — no new Rust code needed beyond
a few runtime flags.

## Layout

```
poc2/
├── README.md              this file
├── samples/
│   ├── shift_heavy.txt    pure shifted-char stress
│   ├── delimiters.txt     every shift-drop pair adjacent
│   └── README.md          notes on what each sample exercises
├── scripts/
│   ├── 01-local-textedit.sh         disambiguate AVD vs our-side
│   ├── 02-mod-hold-sweep.sh         sweep MOD_HOLD_MS = 10/30/50/100ms
│   ├── 03-per-chunk-warmup.sh       toggle per-chunk re-warmup
│   ├── 04-shift-up-between.sh       explicit shift-up between chunks
│   └── 05-baseline-no-folds.sh      see raw signal with folds disabled
└── results/               gitignored — operator captures land here
```

## Running

Each script prints what to do, counts down, then drives the CLI. Output is
written to `poc2/results/<script>-<date>.log` for later analysis.

Prereqs:
- macOS Accessibility + Screen Recording permissions granted to your terminal
- `cargo build -p typer-core --bin typer` clean
- For experiments 02-05 against AVD: a remote VM with Notepad open, calibrated region

```sh
# build once
cd /Users/nicolewang/github/keystream
cargo build -p typer-core --bin typer

# then run experiments in order
./poc2/scripts/01-local-textedit.sh
./poc2/scripts/02-mod-hold-sweep.sh
# ...
```

## Recording results

Append findings to `results/findings.md` (gitignored — keep it local until
they're synthesized into a v2 design doc).

Format per experiment:
```
## 01 local-textedit — 2026-04-27

Target: TextEdit (plain text mode), Consolas 16pt
Sample: shift_heavy.txt
Shift-drops observed: 0 / 247 shifted chars
Conclusion: the bug is AVD-side, not our side
```

## What this round does NOT do

- Run live AVD smoke (operator-only).
- Modify `typer-core/src/fold.rs` band-aids (use `--no-fold` flag at runtime).
- Change defaults in `typer-core/src/config.rs` (only override at runtime).
- Touch the Tauri UI.

The point is to gather data with low blast radius. Once we know which
intervention works, *then* we revise locked decisions and update the
shipped code.
