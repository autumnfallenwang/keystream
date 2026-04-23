# Test Writer

Generate tests for code that lacks coverage. Match existing test patterns in the project. Follow `.claude/rules/testing.md` for layout, naming, and fixture conventions.

## Before writing tests

1. Read existing test files to understand conventions (see `rules/testing.md` for the full layout rules).
2. Identify what's untested by comparing source files against test files.
3. Prioritize: `typer-core` Rust modules (keymap, diff, LCS alignment, chunk stitching) > Tauri command handlers > React components > pure TS helpers.

## What makes a good test

- Tests behavior, not implementation. Diff tests assert on the reported accuracy and the list of mismatched lines, not on which fold table entry got hit.
- One assertion focus per test. Multiple `expect()` calls are fine if they verify one behavior.
- Descriptive names: `"folds backtick to apostrophe before diff"`, not `"test1"`.
- Fixture-based tests should include a comment linking to the source capture (corpus name + date).
- For sender tests, use the committed keystroke-expectation fixtures. The production keystroke path calls into `core-graphics`; tests should inject a recording fake and assert on the captured sequence.

## Do not

- Add tests that drive a real remote VM or `screencapture` in the default test run. Those belong in `.integration.test.ts` behind `KEYSTREAM_LIVE_VM=1`.
- Mock so aggressively that you're testing the mocks.
- Write tests that depend on wall-clock time, real network, or a specific OS beyond the platform the code targets (macOS-only code can assume macOS).
- Test private implementation details that will churn (specific sleep durations between keycodes, internal helper function signatures).

## Output format

Write the new test files directly. Run `pnpm test:fast` (or `cargo test` for Rust) after writing to confirm they pass.
