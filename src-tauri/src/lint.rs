//! Thin Tauri wrapper over `typer_core::check_lines` for the Q8
//! pre-send line-length check. Hardcodes `MAX_LINE_CHARS` from
//! `typer_core::config`; future settings UI (Phase 5) will flow
//! through the existing `max_chars` parameter on the library fn.

use typer_core::config::MAX_LINE_CHARS;
use typer_core::lint::{check_lines as core_check_lines, CheckLinesResult};

#[tauri::command]
pub fn check_lines(text: String) -> CheckLinesResult {
    let result = core_check_lines(&text, MAX_LINE_CHARS);
    log::info!(
        "check_lines: lines_checked={} offending={} ok={}",
        text.lines().count(),
        result.offending.len(),
        result.ok
    );
    result
}
