# Releasing — runbook

Every push to `main` cuts a release. Two workflows drive the pipeline:

- **`.github/workflows/auto-release.yml`** — fires on push to main. Detects whether the version was bumped in that push; if not, auto-bumps the patch number, commits `chore: release vX.Y.Z [skip ci]` back to main, creates the tag, and pushes it.
- **`.github/workflows/release.yml`** — reusable build workflow. Called by auto-release.yml (or triggerable by direct tag push). Builds the **macOS arm64** `.dmg` (Keystream is Apple Silicon only — see design-plan), minisign-signs it, and creates a **draft** GitHub Release with the bundle + `latest.json`.

The maintainer's job is now: decide version (optional), merge to main, watch the workflow, review the draft release, publish.

See also: [`updater-signing.md`](updater-signing.md) for the signing keypair and GH-secret setup.

## Pre-flight checklist

Run once before the very first release. For every release after, skim to confirm nothing has drifted.

- [ ] `gh secret list` shows `TAURI_SIGNING_PRIVATE_KEY`. (See `docs/updater-signing.md` if not.)
- [ ] (Password-protected key only:) also shows `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- [ ] `cat tauri-updater.pub` matches `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` — drift here breaks signature verification for every installed app.
- [ ] Repo → Settings → Actions → General → Workflow permissions is "Read and write permissions". Both `tauri-action` (for Releases) and `auto-release.yml` (for pushing the bump commit + tag) need this.
- [ ] `pnpm check` green on main: lint + typecheck + full test suite.
- [ ] `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` green in `src-tauri/`.

## Cut a release

### Path A — let auto-release decide the version (patch bump)

Typical flow. Merge a feature branch to main without touching version files; auto-release handles the rest.

```bash
git checkout main && git pull
git merge --ff-only feat/foo   # or PR merge via GitHub UI
git push origin main
```

That's it. `auto-release.yml` detects no version change, bumps `0.1.2 → 0.1.3`, commits the bump back to main, tags `v0.1.3`, and hands off to `release.yml`.

### Path B — explicit version (any semver bump)

When you want a `minor`/`major` bump (new feature, breaking change) instead of patch, set the version explicitly before merging.

```bash
git checkout feat/foo
pnpm bump 0.2.0                # edits all 3 version files
git commit -am "chore: release v0.2.0"
git push origin feat/foo
# merge PR / fast-forward to main
git checkout main && git merge --ff-only feat/foo
git push origin main
```

`auto-release.yml` sees the bump, uses `0.2.0` as-is, tags `v0.2.0`, hands off to `release.yml`.

### Update the changelog (either path, before merging)

Edit `CHANGELOG.md`:

- Move everything under `## [Unreleased]` into a new `## [X.Y.Z] — YYYY-MM-DD` section.
- Leave an empty `## [Unreleased]` above it.
- If you're on Path A, use whatever version auto-release will pick (last tag + 0.0.1).

### Watch the workflow

```bash
gh run watch
```

Or open the Actions tab in the browser. `auto-release.yml` finishes the tag step in a few seconds, then `release.yml` builds the macOS arm64 `.dmg` (~10–15 minutes).

If the job fails, see Troubleshooting below. Both workflows are re-runnable from the Actions tab.

### Review the draft release

Once the build job succeeds, `tauri-action` creates a **draft** release at:

```
https://github.com/autumnfallenwang/keystream/releases
```

Verify the assets list includes:

- `Keystream_X.Y.Z_aarch64.dmg` (+ `.sig`)
- `Keystream.app.tar.gz` (+ `.sig`) — the updater payload
- `latest.json` — the manifest that `tauri-plugin-updater` reads

Exact file names may vary by Tauri version; the key thing is the `.dmg` has a matching `.sig` and `latest.json` is present.

### Edit the release body and publish

1. Click the draft release → Edit.
2. Replace the placeholder body with the new `[X.Y.Z]` section from `CHANGELOG.md`.
3. Click **Publish release**.

Publishing moves the release from "draft" to "latest," which is what makes `https://github.com/autumnfallenwang/keystream/releases/latest/download/latest.json` resolve for already-installed apps.

## Smoke test

Minimum viable smoke test — install on Apple Silicon and confirm the app launches:

- Mount the `.dmg`, drag Keystream to Applications.
- Gatekeeper nags (right-click the app → Open → Open). The app is unsigned in v1/v2.
- App window opens. Sidebar shows Open file… / Open folder… and the Explorer section.

Ideal smoke test (also exercises real send pipeline):

1. Open `tests/fixtures/code_corpus.txt` from the file explorer.
2. Click Lock.
3. Focus AVD/Notepad in another window.
4. Click Send. Wait for the countdown, watch the bytes type into the VM.
5. Confirm 0 shift-drops at default 10ms `event_pause_ms`.

## Verify the updater (first time only)

After the first release (v0.1.0), cut v0.1.1 to confirm the update path works end-to-end.

1. On a test machine / VM, install v0.1.0.
2. Back on the dev machine, cut v0.1.1 using the steps above. Ideally with a small, visible change.
3. Wait for the draft to build + publish.
4. Launch the v0.1.0 install. Within a few seconds, the update banner should appear showing "Version 0.1.1 available".
5. Click **Install**. The app should download, verify the signature, install, and relaunch as v0.1.1.
6. Open Settings and confirm the version footer in the sidebar reads `v0.1.1`.

If the banner never appears:
- Confirm the updater plugin is wired (currently future work — see `docs/design-plan.md` "Future work / Logging hardening" and updater status). If the in-app updater UI hasn't shipped yet, the build still produces `latest.json` but there's no client to consume it. The first few releases may need to be installed manually until the updater UI lands.
- Check logs (`<app_data_dir>/logs/app.log`) for `updater:` entries.
- Confirm `https://github.com/autumnfallenwang/keystream/releases/latest/download/latest.json` returns 200 (not 404).

If install fails with "signature verification failed": pubkey in the app drifted from the signing key. See `docs/updater-signing.md` Troubleshooting.

## Troubleshooting

### Workflow fails with `TAURI_SIGNING_PRIVATE_KEY is not set`

GH secret not uploaded. See `docs/updater-signing.md`.

### Workflow fails with permission denied creating release

Repo → Settings → Actions → General → Workflow permissions is "Read-only". Switch to "Read and write permissions".

### macOS build fails with `codesign` error

You're hitting Apple's code-signing requirements, which are separate from Tauri's updater signing. v1/v2 ship unsigned (Gatekeeper warning is documented, not avoided). If this error appears, something in `tauri.conf.json` accidentally enabled macOS signing — check for `macOSPrivateApi` or signing-related fields.

### Release body still says the placeholder text

You forgot the publish step. Edit the draft, paste the CHANGELOG section, publish. The placeholder is a reminder, not a bug.

## Post-release

- If user-visible features changed, update `README.md`'s feature list.
- For significant releases, announce on the project README / issue tracker.
- Sanity check: the published release shows "Latest" badge on the Releases page, and `latest.json` is downloadable.
- **Update this runbook** if you hit anything that this document got wrong. The first few releases are learning opportunities.
