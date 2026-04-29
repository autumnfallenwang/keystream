# Keystream

A desktop app that types text into virtual desktops and remote-desktop sessions keystroke-by-keystroke, with OCR-based verification. Built for environments where clipboard paste is blocked.

## What it does

- **Reliable typing** — sends raw keystrokes via macOS CGEvent so keys reach remote VMs that strip unicode injection. Verified 100% character accuracy on 9,160-char stress runs against a real VM.
- **Visual verify** — after typing, screenshots the target region and runs Apple Vision OCR to compare sent vs. seen text.
- **Scroll-aware** — for documents taller than one viewport, pages through the full file and stitches OCR chunks by content overlap.
- **Region calibration** — drag a rectangle once to tell Keystream where the target text area is on your screen.
- **100% local** — no cloud, no servers, no telemetry. Keystrokes and screenshots never leave your machine.

## Platforms

- macOS 12+ (Apple Silicon). Windows / Linux support is planned but not present in the PoC.

## Status

v2 in active development. The keystroke sender is byte-perfect on AVD (validated 0 / 45,051 chars across 3 × 15k-char runs); v2 strips the v1 OCR-verify pipeline and ships a linear "type and stop" model. Architecture, locked decisions, and historical lessons live in [`docs/`](docs/).

## Development

```bash
pnpm install
pnpm tauri:dev     # launches the desktop app with hot reload
pnpm check         # lint + typecheck + tests
```

## License

MIT. See [LICENSE](./LICENSE).
