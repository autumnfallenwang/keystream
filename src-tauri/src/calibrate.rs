//! `calibrate` Tauri command: spawn the `region_picker` Swift sidecar,
//! parse its `"x y w h"` stdout, validate, persist to the Tauri app data
//! dir, return the `Region` to the frontend.
//!
//! Part of Phase 3 (task 23). Replaces the PoC CLI's `~/.typer/config.txt`
//! storage with Tauri's per-app data dir at
//! `~/Library/Application Support/dev.autumnfallenwang.keystream/region.txt`.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use typer_core::region::{save_region, Region};

const REGION_FILE: &str = "region.txt";

/// Parse the `region_picker` sidecar's stdout into a `Region`. Expected
/// format: `"x y w h"` (space-separated non-negative integers). Tolerant
/// of trailing whitespace since `region_picker` prints a newline.
pub(crate) fn parse_picker_stdout(stdout: &str) -> Result<Region, String> {
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
}
