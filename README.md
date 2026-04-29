# Keystream

A desktop app that types text into virtual desktops and remote-desktop sessions keystroke-by-keystroke. Built for environments where clipboard paste is blocked.

## What it does

- **Reliable typing** — sends raw keystrokes via macOS CGEvent so keys reach remote VMs that strip unicode injection. Validated 0 / 45,051 chars across 3 × 15k-char runs on Azure Virtual Desktop.
- **VSCode-style file explorer** — open a folder, browse the tree, click any file to load it. Binary or non-text files surface a friendly warning instead of garbled output.
- **Send / Pause / Stop** — countdown overlay on every Send and Resume; pause mid-send and resume from the same position.
- **100% local** — no cloud, no servers, no telemetry. Keystrokes and content never leave your machine.

## Platforms

macOS 12+, **Apple Silicon only** (M-series). Intel / Linux / Windows are deferred future work.

## Install

1. Download `Keystream_<version>_aarch64.dmg` from [Releases](https://github.com/autumnfallenwang/keystream/releases/latest).
2. Mount the .dmg, drag **Keystream** to Applications.
3. **Strip the quarantine attribute** so macOS lets the unsigned app run:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Keystream.app"
   ```
   Without this, Gatekeeper refuses to launch the app or the right-click → Open prompt loops without resolving. v2 ships unsigned; OS code signing is deferred work.
4. Launch Keystream from `/Applications/`.
5. Grant **Accessibility** in System Settings → Privacy & Security → Accessibility (required to post keystrokes). The amber warning row at the top of the app links straight to the right pane.
6. After granting, **quit and relaunch** Keystream — `AXIsProcessTrusted()` caches the deny answer for the lifetime of the process, so the new permission only takes effect on the next launch.

If the amber warning persists after a relaunch, see [Troubleshooting](#troubleshooting--accessibility-stuck-denied) below.

## Updating

After v0.1.3 the in-app updater is wired. Settings → About → **Check now** downloads + signature-verifies + installs new versions in place. The first install is always a manual `.dmg` from Releases; subsequent updates flow through the in-app button.

## Troubleshooting — Accessibility stuck denied

Symptom: granted Accessibility in System Settings, restarted the app, amber warning still showing.

Cause: macOS keys Accessibility grants by binary path. If multiple Keystream entries exist (e.g. an old `target/debug/keystream` from local development), the granted entry may not match the one that's actually running.

Fix:
1. Quit Keystream (Cmd+Q). Confirm no `keystream` process in Activity Monitor.
2. System Settings → Privacy & Security → Accessibility.
3. Remove **every** Keystream-like entry with the `−` button (may need to unlock first).
4. Click `+`, pick `/Applications/Keystream.app` explicitly, toggle on.
5. Launch from `/Applications/` again.

## Status

v2 active. Live decisions + architecture: [`docs/design-plan.md`](docs/design-plan.md). Phase status: [`docs/progress.md`](docs/progress.md). Releasing runbook: [`docs/releasing.md`](docs/releasing.md).

## Development

```bash
pnpm install
pnpm tauri:dev     # launches the desktop app with hot reload
pnpm check         # lint + typecheck + tests
```

Note: dev-mode dock icons are macOS fallbacks, not the bundled icon — see `docs/lessons.md` "Dev-mode dock icons are meaningless" for why.

## License

MIT. See [LICENSE](./LICENSE).
