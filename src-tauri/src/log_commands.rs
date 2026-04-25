//! Tauri command bridges to the JSON file logger. The frontend uses
//! these to record its own `console.log` / warn / error messages into
//! the same log file as the backend, so a single bug report carries
//! both sides' breadcrumbs.
//!
//! Argument validation: `message` is bounded by
//! `crate::validation::MAX_TEXT_BYTES` (1 MiB). See rules/security.md.

use crate::default_log_dir;
use crate::validation::validate_text_size;

#[tauri::command]
pub fn log_info(message: String) -> Result<(), String> {
    validate_text_size(&message, "message")?;
    log::info!("[webview] {message}");
    Ok(())
}

#[tauri::command]
pub fn log_warn(message: String) -> Result<(), String> {
    validate_text_size(&message, "message")?;
    log::warn!("[webview] {message}");
    Ok(())
}

#[tauri::command]
pub fn log_error(message: String) -> Result<(), String> {
    validate_text_size(&message, "message")?;
    log::error!("[webview] {message}");
    Ok(())
}

#[tauri::command]
pub fn open_log_dir() -> Result<(), String> {
    let dir = default_log_dir();
    log::info!("open_log_dir: path={}", dir.display());
    open::that(&dir).map_err(|e| format!("Failed to open log directory: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validation::MAX_TEXT_BYTES;

    // Wiring tests: each log_* command rejects oversized messages.
    // Regression target: a future edit that drops `validate_text_size`
    // from the command body would still pass validation.rs's unit tests
    // but fail these.

    #[test]
    fn log_info_rejects_oversized_message() {
        let big = "x".repeat(MAX_TEXT_BYTES + 1);
        assert!(log_info(big).is_err());
    }

    #[test]
    fn log_warn_rejects_oversized_message() {
        let big = "x".repeat(MAX_TEXT_BYTES + 1);
        assert!(log_warn(big).is_err());
    }

    #[test]
    fn log_error_rejects_oversized_message() {
        let big = "x".repeat(MAX_TEXT_BYTES + 1);
        assert!(log_error(big).is_err());
    }
}
