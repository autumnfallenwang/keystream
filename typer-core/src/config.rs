//! Named numeric constants. Task 9 will populate the rest (MAX_LINE_CHARS,
//! COUNTDOWN_SECS, EVENT_PAUSE_MS, etc.); task 8 pre-seeds just the two
//! its new APIs need.

/// Number of source lines per chunk in v1's chunked send-and-verify
/// loop (locked decision Q7).
pub const CHUNK_SIZE_LINES: usize = 5;

/// Milliseconds to sleep between a `send_chunk` returning and
/// `verify_visible` capturing the OCR. Gives the RDP hop + target
/// editor time to render the just-typed chars. Matches the PoC's
/// post-send sleep (see `run_verify_diff` / `run_scroll_verify`).
pub const CHUNK_VERIFY_SETTLE_MS: u64 = 500;
