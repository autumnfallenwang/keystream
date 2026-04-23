# Testing Rules

## File layout

- Pure TS logic colocated: `src/lib/core/diff.ts` → `src/lib/core/diff.test.ts`
- Frontend / cross-cutting unit tests under `tests/` mirroring source: `src/lib/core/diff.ts` → `tests/lib/core/diff.test.ts` (choose one style per module; don't double-colonize)
- Integration tests: `.integration.test.ts` under `tests/integration/`
- Rust unit tests: inline `#[cfg(test)] mod tests { }` inside the module (both `typer-core/` and `src-tauri/`)
- Rust integration tests: `typer-core/tests/` for lib integration, `src-tauri/tests/` for Tauri-level integration

## Fixtures

- Committed fixtures in `tests/fixtures/` — synthetic or scrubbed per security rules.
- **OCR JSON fixtures** — capture the `ocr_helper` output against synthetic screenshots (a PNG of `code_corpus.txt` typed into a local TextEdit, not against real remote-VM work). Commit both the PNG and the JSON.
- **Keystroke expectation fixtures** — for a given input string, the expected sequence of `(keycode, down/up, modifier)` tuples. Let `typer-core` emit these in a test-only mode and diff against the committed fixture. Catches keymap regressions without needing a real target window.
- Never commit fixtures captured from real remote-VM sessions. Always reproduce with a local editor first.

## Integration tests

- Real-VM smoke tests load from `sandbox/.env` (e.g. an absolute path to a test VM's expected window title), skip gracefully with `fs.existsSync()` / env-var guards when the harness is missing. A skip is NOT a failure.
- Live VM tests are gated behind `KEYSTREAM_LIVE_VM=1`. Never run in CI.
- Default `pnpm test` and `pnpm test:fast` never touch a real VM or the screen-capture APIs.

## Practices

- Mock Tauri APIs at the module boundary using `vi.mock("@/lib/ipc", ...)`. Pure core modules (`src/lib/core/`) don't need mocking — they're already pure.
- For Rust: mock the event-source / event-tap surface behind a trait so `typer-core` tests can run without posting real CGEvents. The production impl calls into `core-graphics`; the test impl records calls.
- Keep tests deterministic — no flaky timeouts, no real clocks. Use `vi.useFakeTimers()` for scheduler tests; use a controllable clock trait in Rust.
- Tauri commands are testable as plain async functions — don't spin up a full Tauri app for unit coverage.
- Use temp directories for any FS interaction (`tempfile` crate in Rust, `os.tmpdir()` in Node).
- Test behavior, not implementation. Diff tests assert on the reported accuracy and the list of mismatched lines, not on which fold table entry got hit.
- Descriptive test names: `"folds backtick to apostrophe before diff"`, not `"test1"`.

## Regression coverage to keep

These are the invariants proven by the PoC. Every refactor must keep passing:

1. **Sender accuracy** — typing the `code_corpus.txt` sample produces 0 skipped chars and 0 typing errors (verified against a captured reference OCR JSON fixture).
2. **Shift warmup** — removing the warmup causes the first shifted char to drop. Have a test that would catch this regression.
3. **Scroll-verify stitching** — given three overlapping OCR chunks from the sample corpus, stitching produces the expected 58-line result.
4. **LCS alignment handles drops** — OCR drops of blank lines and single-`}` lines don't cascade into every subsequent line looking like a mismatch.
