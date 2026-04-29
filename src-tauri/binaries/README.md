# Sidecar binaries (v2: empty)

Empty in v2. Both v1 sidecars (`ocr_helper`, `region_picker`) were
removed in Phase v2-2 along with the rest of the OCR pipeline.

History: v1 bundled two Swift sidecars into the Keystream `.app`:

- `ocr_helper-<triple>` — Apple Vision OCR. Reads a PNG, emits JSON
  with `{ lines, joined }`. Used by the per-chunk verify loop.
- `region_picker-<triple>` — full-screen overlay for region calibration.
  Used by the `calibrate` Tauri command.

Both became unnecessary when poc2 validated that
`CGEventSourceStateID::Private` makes the keystroke sender byte-perfect
on AVD (see `docs/lessons.md` poc2 entries). With reliable input,
OCR-verify is solving a problem that no longer exists.

## If a future feature needs OCR or region selection

Restore from git history. The last commit with both sidecars is the
v1 freeze (commit before the v2-2 strip). Either:

```sh
git show <hash>:src-tauri/binaries/src/ocr_helper.swift > src-tauri/binaries/src/ocr_helper.swift
git show <hash>:src-tauri/binaries/ocr_helper-aarch64-apple-darwin \
    > src-tauri/binaries/ocr_helper-aarch64-apple-darwin
chmod +x src-tauri/binaries/ocr_helper-aarch64-apple-darwin
```

Then re-add to `tauri.conf.json`:

```json
"bundle": { "externalBin": ["binaries/ocr_helper"] }
```

Same procedure for `region_picker`.

## Provenance rule (still applies if you bring sidecars back)

Per `rules/security.md`: every committed binary in this directory must
be built from the source in `src-tauri/binaries/src/` and committed in
the same commit. Don't commit a binary without its source or a source
change without the rebuilt binary. Sidecars must never reach the
network.
