# PoC — Proof-of-Concept artifacts

Everything in this directory is **reference material from the work that preceded Keystream**. It's committed for posterity and future debugging, not wired into the build. Nothing here is compiled or imported by the Tauri app.

If you're trying to understand *why* Keystream makes a particular design choice, the answer almost always lives either here (the code that proved the choice works) or in [`../lessons.md`](../lessons.md) / [`../design-plan.md`](../design-plan.md) (the write-up).

## Layout

```
docs/poc/
├── typer/               Rust CLI — the first working sender + verify pipeline
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs      send/verify/scroll-verify/calibrate subcommands
│       └── keymap.rs    US ANSI char → CGEvent keycode table
├── ocr_helper/          Swift sidecars (source only; binaries will be rebuilt
│   │                    into src-tauri/binaries/ in Phase 2)
│   ├── ocr_helper.swift       Apple Vision OCR → JSON (stdin: PNG path)
│   └── region_picker.swift    Fullscreen overlay → drag → "x y w h" to stdout
├── samples/             Synthetic content we authored ourselves
│   └── code_corpus.txt        916-char TypeScript corpus used for stress runs
├── results/             The single stress-run capture that first hit 0 typing
│   │                    errors — referenced as the regression fixture in
│   │                    docs/progress.md task 8
│   ├── stress1_avd.png
│   └── stress1_ocr.json
└── python-predecessor/  The very first version of this tool — Python + pyautogui
    ├── type.py                CLI: typed text into the foreground app
    └── type_gui.py            tkinter GUI wrapper
```

## The three lineages

**1. Python** (`python-predecessor/`)
Built first. Used `pyautogui`. Worked against local editors but had high error rates against remote VMs — we initially thought it was network jitter; turned out to be the tool sending unicode injection that RDP clients drop. Kept here as historical context.

**2. Rust CLI** (`typer/`)
Second iteration. Switched to direct CGEvent keycodes to avoid the unicode-injection problem. Added Swift OCR verify loop, LCS alignment, chunk stitching, fold tolerances. This is the code that proved all six locked decisions in [`../design-plan.md`](../design-plan.md) — Q1 (keycodes not unicode), Q2 (cliclick recipe not flags), Q3 (shift warmup), Q4 (Vision OCR sidecar), Q5 (PageUp/PageDown not Ctrl+Home), Q6 (LCS alignment).

**3. Tauri app** (the rest of this repo)
Third iteration. Everything that works in `typer/` gets extracted into a `typer-core` library, wrapped by Tauri commands, and driven by a Next.js UI. The PoC CLI is NOT deleted — it stays as a CLI test harness during `typer-core` development (Phase 2).

## The 98.30–98.37% number

The headline measurement from the PoC: **0 typing errors across 9,160 characters typed against a real remote VM**, over 5 back-to-back stress runs. The ~1.7% residual diff is OCR misreads (`<` → `‹`, `0` → `e`, etc.), not typing errors. Every Keystream refactor must keep this number.

The stress run fixture (`results/stress1_*`) is from that run. Keep it — when `typer-core` is extracted in Phase 2, its regression tests will diff against this exact OCR JSON to prove no keystroke regressions slipped in.

## What's intentionally missing

- **Built binaries** (`typer` executable, `ocr_helper` / `region_picker` Mach-O binaries) — derived artifacts. Rebuild from source with the instructions below. The production binaries will live in `src-tauri/binaries/` once Phase 2 lands.
- **`target/`** — Rust build output. Not committed.
- **`Cargo.lock`** — omitted for reference-only code; if you want reproducible PoC builds, `cargo generate-lockfile` regenerates it from `Cargo.toml`.

## Rebuilding the PoC locally (optional)

None of this is required to work on Keystream. It's here if you want to verify PoC claims independently, or experiment before extracting logic into `typer-core`.

```sh
# Rust CLI
cd docs/poc/typer
cargo build --release
./target/release/typer --help

# Swift OCR helper
cd ../ocr_helper
swiftc -O ocr_helper.swift -o ocr_helper
./ocr_helper path/to/screenshot.png | jq .

# Swift region picker
swiftc -O region_picker.swift -o region_picker
./region_picker    # drag a rectangle, prints "x y w h"
```

The calibrate → send → scroll-verify flow is documented step-by-step in [`../lessons.md`](../lessons.md) for the PoC CLI; the same flow will be the basis for the Tauri commands in Phase 3.
