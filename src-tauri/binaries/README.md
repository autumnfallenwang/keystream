# Swift sidecars

Two sidecar binaries bundled into the Keystream `.app`:

- `ocr_helper-<triple>` — Apple Vision OCR. Reads a PNG path, emits JSON
  `{ lines: [{ text, confidence, x, y, width, height }], joined }` to
  stdout. Proven at ~98.3% accuracy on the PoC stress run.
- `region_picker-<triple>` — full-screen overlay. User drags a
  rectangle; prints `x y w h` (in screencapture coordinates, Y from top)
  to stdout and exits.

## Provenance rule (rules/security.md)

Every binary here must be built from the source in
`src-tauri/binaries/src/` and committed in the same commit as its
source. Don't commit a binary without its source or a source change
without the rebuilt binary.

Sidecars must never reach the network.

## Supported targets

v1 ships arm64 macOS only (`aarch64-apple-darwin`). Future:
`x86_64-apple-darwin`, universal binaries (`lipo -create ...`).

## Rebuild

From repo root:

```sh
swiftc -O src-tauri/binaries/src/ocr_helper.swift \
  -o src-tauri/binaries/ocr_helper-aarch64-apple-darwin

swiftc -O src-tauri/binaries/src/region_picker.swift \
  -o src-tauri/binaries/region_picker-aarch64-apple-darwin
```

## Smoke-test

```sh
# ocr_helper against the committed stress-run PNG. Expected: 30 lines
# (matches docs/poc/results/stress1_ocr.json exactly).
./src-tauri/binaries/ocr_helper-aarch64-apple-darwin \
  docs/poc/results/stress1_avd.png | jq '.lines | length'

# region_picker — opens full-screen overlay. Esc to cancel. Drag a
# rectangle to print "x y w h" to stdout and exit.
./src-tauri/binaries/region_picker-aarch64-apple-darwin
```

## Tauri wiring (task 23)

Tauri 2 expects sidecars named `<name>-<target-triple>` on disk and
referenced unsuffixed in `tauri.conf.json`:

```json
"bundle": {
  "externalBin": ["binaries/ocr_helper", "binaries/region_picker"]
}
```

Task 23 adds this declaration and writes the `calibrate` Tauri command
that spawns `region_picker`.

## Permissions

On first launch, macOS Gatekeeper will warn that these binaries are
unsigned. v1 ships unsigned (per CLAUDE.md "Unsigned binaries in v1");
signing is future work.

`ocr_helper` reads local PNGs and needs no special permissions.
`region_picker` renders a full-screen overlay and captures drag input
— macOS may request Accessibility or Input Monitoring permission on
first interactive use.
