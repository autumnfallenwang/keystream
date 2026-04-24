//! Named numeric constants for typer-core. All wait durations, counts,
//! and tunable defaults live here per `.claude/rules/conventions.md`
//! "Keystroke timing": no magic numbers anywhere else in the library.
//!
//! v1 hardcodes these. When a settings UI lands in Phase 5, these
//! become the *defaults* for a user-editable config struct; the
//! constant names don't change.

// --- Chunked send-and-verify (Q7, Q9) ---

/// Number of source lines per chunk in v1's chunked send-and-verify
/// loop (locked decision Q7).
pub const CHUNK_SIZE_LINES: usize = 5;

/// Milliseconds to sleep between a `send_chunk` returning and
/// `verify_visible` capturing the OCR. Gives the RDP hop + target
/// editor time to render the just-typed chars. Matches the PoC's
/// post-send sleep.
pub const CHUNK_VERIFY_SETTLE_MS: u64 = 500;

// --- Line-length pre-check (Q8) ---

/// Maximum source-line width accepted by the pre-send check. Longer
/// lines would force AVD horizontal scroll, which v1 does not support.
/// Consumed by the future `check_lines` Tauri command (task 25).
pub const MAX_LINE_CHARS: usize = 80;

// --- Countdown before send ---

/// Seconds the countdown overlay counts down (Q3 shift warmup fires
/// during this window). Consumed by the future
/// `send_with_chunked_verify` Tauri command (task 26) and countdown
/// overlay UI (task 38).
pub const COUNTDOWN_SECS: u64 = 3;

// --- Keystroke timing (Q2 cliclick recipe) ---

/// Sleep after each key down/up event. Matches cliclick's 10ms —
/// proven reliable against AVD across the PoC stress runs.
pub const EVENT_PAUSE_MS: u64 = 10;

/// Hold time between shift down/up and the char event (Q2 recipe).
pub const MOD_HOLD_MS: u64 = 10;

/// Minimum floor for `mod_hold_ms` during warmup (Q3). Warmup uses
/// `cfg.mod_hold_ms.max(MOD_HOLD_MIN_MS)` so a caller that zeroes out
/// mod_hold_ms for non-warmup purposes still gets a real shift hold
/// during warmup.
pub const MOD_HOLD_MIN_MS: u64 = 10;

/// Settle time after the warmup shift release, before the real send
/// starts. Gives the VM modifier-state tracker time to reset before
/// the first character.
pub const WARMUP_SETTLE_MS: u64 = 50;

// --- Default SendCfg values (Q3) ---

/// Whether `SendCfg::default()` enables shift warmup. Q3 mandates
/// this stays true — do not change in v1.
pub const DEFAULT_WARMUP_SHIFT: bool = true;

// --- clear_editor timing ---

/// Settle after Ctrl-up and after Backspace in `clear_editor`. Larger
/// than `EVENT_PAUSE_MS` because the editor takes time to process the
/// full select-all-and-delete sequence.
pub const CLEAR_EDITOR_SETTLE_MS: u64 = 150;

// --- Scroll-verify (Q5) ---

/// Safety cap: maximum PageDown steps scroll_verify will attempt
/// before giving up. Covers files up to ~30 viewports tall.
pub const SCROLL_MAX_PAGES: u32 = 30;

/// Wait after each PageDown before capturing the next OCR chunk.
pub const SCROLL_SETTLE_MS: u64 = 250;

/// Number of PageUps to brute-force scroll-to-top. Q5: Ctrl+Home
/// doesn't reach AVD, so we spam PageUp instead. 40 is enough for
/// files up to ~40 viewports tall.
pub const SCROLL_TO_TOP_PAGE_UPS: u32 = 40;

/// Inter-PageUp pause during the scroll-to-top brute force. Shorter
/// than `SCROLL_SETTLE_MS` because we're not OCRing between presses —
/// just getting to the top.
pub const PAGE_UP_INTER_MS: u64 = 30;

// --- Verify pass threshold (Q9) ---

/// Per-chunk verify passes iff `DiffStats.char_diffs <= this`. Q9
/// locks this at 0 for v1 (strict zero char diffs after fold).
/// Declared as a const for future caller reference; `DiffStats::passes_q9()`
/// hardcodes the `== 0` check rather than reading this to stay
/// self-documenting. A future stricter mode could read this instead.
pub const VERIFY_PASS_THRESHOLD: usize = 0;
