//! Region-state Tauri commands: `calibrate` (spawn the `region_picker`
//! sidecar, save fresh region), `get_region` (read saved region; `None`
//! if not yet calibrated), `clear_region` (idempotently delete).
//!
//! Part of Phase 3 (tasks 23–24). Replaces the PoC CLI's
//! `~/.typer/config.txt` storage with Tauri's per-app data dir at
//! `~/Library/Application Support/dev.autumnfallenwang.keystream/region.txt`.

use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use typer_core::region::{load_region, save_region, Region};
use typer_core::TyperError;

const REGION_FILE: &str = "region.txt";

/// Parse the `region_picker` sidecar's stdout into a `Region`. Expected
/// format: `"x y w h"` (space-separated non-negative integers). Tolerant
/// of trailing whitespace since `region_picker` prints a newline.
///
/// `pub` (not `pub(crate)`) so integration tests at the crate boundary
/// can exercise it through the public API.
pub fn parse_picker_stdout(stdout: &str) -> Result<Region, String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err("region_picker returned empty output".into());
    }
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() != 4 {
        return Err(format!(
            "region_picker output malformed: expected 4 integers, got {} token(s) ({trimmed:?})",
            parts.len()
        ));
    }
    let nums: Vec<i32> = parts
        .iter()
        .map(|s| s.parse::<i32>().map_err(|e| format!("parse {s:?}: {e}")))
        .collect::<Result<_, _>>()?;
    if nums.iter().any(|&n| n < 0) {
        return Err(format!(
            "region coordinates must be non-negative; got {nums:?}"
        ));
    }
    Ok(Region {
        x: nums[0],
        y: nums[1],
        w: nums[2],
        h: nums[3],
    })
}

/// Build `<app_data_dir>/region.txt`.
pub(crate) fn region_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join(REGION_FILE))
        .map_err(|e| format!("app_data_dir: {e}"))
}

/// Spawn `region_picker`, drag-and-parse, persist, return the saved
/// `Region`. Errors surface as plain-language strings suitable for the
/// UI to display.
#[tauri::command]
pub async fn calibrate(app: AppHandle) -> Result<Region, String> {
    log::info!("calibrate: spawning region_picker sidecar");
    let sidecar = app
        .shell()
        .sidecar("region_picker")
        .map_err(|e| format!("sidecar init: {e}"))?;
    let output = sidecar
        .output()
        .await
        .map_err(|e| format!("sidecar spawn: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::warn!(
            "calibrate: region_picker exited non-zero ({:?}): {stderr}",
            output.status
        );
        return Err(format!(
            "region_picker failed (status {:?}): {stderr}",
            output.status
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let region = parse_picker_stdout(&stdout)?;

    let path = region_path(&app)?;
    save_region(&region, &path).map_err(|e| format!("save_region: {e}"))?;

    log::info!(
        "calibrate: saved region x={} y={} w={} h={} -> {}",
        region.x,
        region.y,
        region.w,
        region.h,
        path.display()
    );
    Ok(region)
}

/// Load the region from `path`. `Ok(None)` if the file doesn't exist
/// yet (not-yet-calibrated state; a normal state, not an error).
/// Other I/O errors and malformed content surface as `Err(String)`.
pub(crate) fn load_region_at(path: &Path) -> Result<Option<Region>, String> {
    match load_region(path) {
        Ok(r) => Ok(Some(r)),
        Err(TyperError::RegionNotFound { .. }) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Remove the region file at `path`. Idempotent: missing file is not
/// an error. Other I/O failures are reported.
pub(crate) fn clear_region_at(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("remove {}: {e}", path.display())),
    }
}

/// Read the saved region. Returns `None` if not yet calibrated (normal
/// state — frontend renders ✗ on the gate indicator).
#[tauri::command]
pub async fn get_region(app: AppHandle) -> Result<Option<Region>, String> {
    let path = region_path(&app)?;
    let result = load_region_at(&path);
    match &result {
        Ok(Some(r)) => log::info!("get_region: loaded x={} y={} w={} h={}", r.x, r.y, r.w, r.h),
        Ok(None) => log::info!("get_region: no region saved"),
        Err(e) => log::warn!("get_region: {e}"),
    }
    result
}

/// Delete the saved region, if any. Idempotent.
#[tauri::command]
pub async fn clear_region(app: AppHandle) -> Result<(), String> {
    let path = region_path(&app)?;
    let result = clear_region_at(&path);
    match &result {
        Ok(()) => log::info!("clear_region: cleared ({})", path.display()),
        Err(e) => log::warn!("clear_region: {e}"),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_region() {
        let r = parse_picker_stdout("100 200 1707 922\n").unwrap();
        assert_eq!(
            r,
            Region {
                x: 100,
                y: 200,
                w: 1707,
                h: 922,
            }
        );
    }

    #[test]
    fn parse_valid_region_no_trailing_newline() {
        let r = parse_picker_stdout("0 0 100 100").unwrap();
        assert_eq!(
            r,
            Region {
                x: 0,
                y: 0,
                w: 100,
                h: 100,
            }
        );
    }

    #[test]
    fn parse_rejects_empty() {
        assert!(parse_picker_stdout("").is_err());
        assert!(parse_picker_stdout("   \n\n").is_err());
    }

    #[test]
    fn parse_rejects_wrong_token_count() {
        assert!(parse_picker_stdout("100 200 300").is_err());
        assert!(parse_picker_stdout("100 200 300 400 500").is_err());
    }

    #[test]
    fn parse_rejects_non_numeric() {
        assert!(parse_picker_stdout("100 200 foo 400").is_err());
    }

    #[test]
    fn parse_rejects_negative() {
        assert!(parse_picker_stdout("-1 0 100 100").is_err());
        assert!(parse_picker_stdout("0 0 -50 100").is_err());
    }

    #[test]
    fn load_region_at_returns_none_when_missing() {
        let path = std::env::temp_dir().join("kstest_load_region_missing.txt");
        let _ = std::fs::remove_file(&path);
        assert_eq!(load_region_at(&path).unwrap(), None);
    }

    #[test]
    fn load_region_at_returns_some_after_save() {
        let path = std::env::temp_dir().join("kstest_load_region_roundtrip.txt");
        let r = Region {
            x: 1,
            y: 2,
            w: 3,
            h: 4,
        };
        typer_core::region::save_region(&r, &path).unwrap();
        let loaded = load_region_at(&path).unwrap();
        assert_eq!(loaded, Some(r));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn load_region_at_errors_on_malformed() {
        let path = std::env::temp_dir().join("kstest_load_region_bad.txt");
        std::fs::write(&path, "not four integers").unwrap();
        let result = load_region_at(&path);
        assert!(result.is_err());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn clear_region_at_is_idempotent() {
        let path = std::env::temp_dir().join("kstest_clear_region_missing.txt");
        let _ = std::fs::remove_file(&path);
        assert!(clear_region_at(&path).is_ok());
        // Second call on a missing file must also succeed.
        assert!(clear_region_at(&path).is_ok());
    }

    #[test]
    fn clear_region_at_removes_existing_file() {
        let path = std::env::temp_dir().join("kstest_clear_region_existing.txt");
        std::fs::write(&path, "0 0 100 100\n").unwrap();
        assert!(path.exists());
        clear_region_at(&path).unwrap();
        assert!(!path.exists());
    }
}
