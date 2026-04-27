//! Text persistence for the v1 UI's "last-loaded text" model (task 43).
//!
//! Mirrors the region-persistence pattern (`calibrate.rs` + `typer_core::region`):
//! plain UTF-8 text at `<app_data_dir>/text.txt`. Saved on every locked
//! transition (Submit / file-load); restored on mount; cleared via the
//! gate-strip Clear button.
//!
//! Per `rules/security.md`: persistence of user-initiated content is
//! permitted (under the user's filesystem permissions, reversible via Clear);
//! logging of that content is not. This module logs counts only.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::validation::{validate_text_size, MAX_TEXT_BYTES};

const TEXT_FILE: &str = "text.txt";

/// Build `<app_data_dir>/text.txt`.
pub(crate) fn text_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join(TEXT_FILE))
        .map_err(|e| format!("app_data_dir: {e}"))
}

/// Write `text` to `path`, creating the parent dir if needed.
/// Caller has already validated size via `validate_text_size`.
pub(crate) fn save_text_at(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all {}: {e}", parent.display()))?;
    }
    fs::write(path, text).map_err(|e| format!("write {}: {e}", path.display()))
}

/// Load text at `path`. Returns `Ok(None)` if the file doesn't exist
/// (normal first-launch state). Errors on I/O failure or oversized file.
pub(crate) fn load_text_at(path: &Path) -> Result<Option<String>, String> {
    let mut file = match fs::File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("open {}: {e}", path.display())),
    };
    // Cap read at MAX_TEXT_BYTES + 1 to detect oversized files cleanly.
    let mut bytes = Vec::new();
    let limit = (MAX_TEXT_BYTES + 1) as u64;
    file.by_ref()
        .take(limit)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("read {}: {e}", path.display()))?;
    if bytes.len() > MAX_TEXT_BYTES {
        return Err(format!(
            "saved text too large: more than {MAX_TEXT_BYTES} bytes"
        ));
    }
    let text = String::from_utf8(bytes).map_err(|_| "saved text is not valid UTF-8".to_string())?;
    Ok(Some(text))
}

/// Idempotent delete; missing file is not an error.
pub(crate) fn clear_text_at(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("remove {}: {e}", path.display())),
    }
}

#[tauri::command]
pub fn save_text(app: AppHandle, text: String) -> Result<(), String> {
    validate_text_size(&text, "text")?;
    let path = text_path(&app)?;
    save_text_at(&path, &text)?;
    log::info!("save_text: bytes={}", text.len());
    Ok(())
}

#[tauri::command]
pub fn get_text(app: AppHandle) -> Result<Option<String>, String> {
    let path = text_path(&app)?;
    let result = load_text_at(&path);
    match &result {
        Ok(Some(t)) => log::info!(
            "get_text: loaded bytes={} lines={}",
            t.len(),
            t.lines().count()
        ),
        Ok(None) => log::info!("get_text: no text saved"),
        Err(e) => log::warn!("get_text: {e}"),
    }
    result
}

#[tauri::command]
pub fn clear_text(app: AppHandle) -> Result<(), String> {
    let path = text_path(&app)?;
    let result = clear_text_at(&path);
    match &result {
        Ok(()) => log::info!("clear_text: cleared {}", path.display()),
        Err(e) => log::warn!("clear_text: {e}"),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("kstest_persist_{name}"))
    }

    #[test]
    fn load_text_at_returns_none_when_missing() {
        let path = tmp("missing.txt");
        let _ = fs::remove_file(&path);
        assert_eq!(load_text_at(&path).unwrap(), None);
    }

    #[test]
    fn roundtrip_save_then_load() {
        let path = tmp("roundtrip.txt");
        save_text_at(&path, "hello\nworld").unwrap();
        let loaded = load_text_at(&path).unwrap();
        assert_eq!(loaded, Some("hello\nworld".to_string()));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn clear_text_at_is_idempotent() {
        let path = tmp("idempotent.txt");
        let _ = fs::remove_file(&path);
        assert!(clear_text_at(&path).is_ok());
        assert!(clear_text_at(&path).is_ok());
    }

    #[test]
    fn clear_text_at_removes_existing_file() {
        let path = tmp("removes.txt");
        save_text_at(&path, "hi").unwrap();
        assert!(path.exists());
        clear_text_at(&path).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn load_text_at_errors_on_oversized_file() {
        let path = tmp("oversize.txt");
        let big = vec![b'a'; MAX_TEXT_BYTES + 1];
        fs::write(&path, &big).unwrap();
        let err = load_text_at(&path).unwrap_err();
        assert!(err.contains("too large"), "got: {err}");
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn save_text_at_then_load_with_unicode_content() {
        let path = tmp("unicode.txt");
        let text = "héllo · 世界 · emoji 🚀";
        save_text_at(&path, text).unwrap();
        let loaded = load_text_at(&path).unwrap();
        assert_eq!(loaded, Some(text.to_string()));
        let _ = fs::remove_file(&path);
    }
}
