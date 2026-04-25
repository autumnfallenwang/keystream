//! Thin Tauri wrapper over `typer_core::check_lines` for the Q8
//! pre-send line-length check. Hardcodes `MAX_LINE_CHARS` from
//! `typer_core::config`; future settings UI (Phase 5) will flow
//! through the existing `max_chars` parameter on the library fn.
//!
//! Argument validation: `text` is bounded by
//! `crate::validation::MAX_TEXT_BYTES` (1 MiB). See rules/security.md.

use typer_core::config::MAX_LINE_CHARS;
use typer_core::lint::{check_lines as core_check_lines, CheckLinesResult};

use crate::validation::validate_text_size;

#[tauri::command]
pub fn check_lines(text: String) -> Result<CheckLinesResult, String> {
    validate_text_size(&text, "text")?;
    let result = core_check_lines(&text, MAX_LINE_CHARS);
    log::info!(
        "check_lines: lines_checked={} offending={} ok={}",
        text.lines().count(),
        result.offending.len(),
        result.ok
    );
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validation::MAX_TEXT_BYTES;

    #[test]
    fn check_lines_rejects_oversized_text() {
        // Pins that the validate_text_size call is wired. A regression
        // that removes the validator from the command body would still
        // pass validation.rs's unit tests but fail this one.
        let big = "a".repeat(MAX_TEXT_BYTES + 1);
        assert!(check_lines(big).is_err());
    }

    #[test]
    fn check_lines_accepts_normal_text() {
        let result = check_lines("hello\nworld".to_string()).unwrap();
        assert!(result.ok);
        assert!(result.offending.is_empty());
    }

    #[test]
    fn check_lines_returns_offending_for_long_line() {
        // Wrapper round-trips through typer_core::check_lines correctly.
        let long = "a".repeat(90); // exceeds MAX_LINE_CHARS = 80
        let result = check_lines(long).unwrap();
        assert!(!result.ok);
        assert_eq!(result.offending.len(), 1);
        assert_eq!(result.offending[0].length, 90);
    }
}
