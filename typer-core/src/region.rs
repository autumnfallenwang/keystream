//! Calibrated-region persistence. Tauri's app data dir is the production
//! location; the PoC used `~/.typer/config.txt`. This module takes the
//! directory as a parameter so either caller can use it (Tauri passes
//! `path::app_data_dir`, tests pass a tempdir).

use crate::error::{Result, TyperError};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Region {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

pub const REGION_FILE_NAME: &str = "region.txt";

/// Default legacy path `~/.typer/config.txt`. Used by the PoC CLI shim.
/// Tauri callers should construct a path under app_data_dir instead.
pub fn legacy_config_path() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or(TyperError::HomeDirNotFound)?;
    Ok(home.join(".typer").join("config.txt"))
}

pub fn save_region(r: &Region, path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| TyperError::Io {
            path: parent.display().to_string(),
            source: e,
        })?;
    }
    fs::write(path, format!("{} {} {} {}\n", r.x, r.y, r.w, r.h)).map_err(|e| TyperError::Io {
        path: path.display().to_string(),
        source: e,
    })?;
    log::info!(
        "calibrate: saved region x={} y={} w={} h={}",
        r.x,
        r.y,
        r.w,
        r.h
    );
    Ok(())
}

pub fn load_region(path: &Path) -> Result<Region> {
    let raw = fs::read_to_string(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            TyperError::RegionNotFound {
                path: path.display().to_string(),
            }
        } else {
            TyperError::Io {
                path: path.display().to_string(),
                source: e,
            }
        }
    })?;
    let parts: Vec<i32> = raw
        .split_whitespace()
        .filter_map(|s| s.parse().ok())
        .collect();
    if parts.len() != 4 {
        return Err(TyperError::RegionMalformed {
            path: path.display().to_string(),
            reason: format!("expected 4 integers, got {}", parts.len()),
        });
    }
    Ok(Region {
        x: parts[0],
        y: parts[1],
        w: parts[2],
        h: parts[3],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_save_load_in_tempdir() {
        let tmp = std::env::temp_dir().join("typer_core_region_roundtrip.txt");
        let r = Region {
            x: 100,
            y: 200,
            w: 1707,
            h: 922,
        };
        save_region(&r, &tmp).unwrap();
        let loaded = load_region(&tmp).unwrap();
        assert_eq!(loaded, r);
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn load_missing_returns_not_found() {
        let missing = std::env::temp_dir().join("typer_core_definitely_not_there_xyz.txt");
        let _ = std::fs::remove_file(&missing);
        let err = load_region(&missing).unwrap_err();
        assert!(matches!(err, TyperError::RegionNotFound { .. }));
    }

    #[test]
    fn load_malformed_returns_malformed() {
        let tmp = std::env::temp_dir().join("typer_core_region_bad.txt");
        std::fs::write(&tmp, "not four integers").unwrap();
        let err = load_region(&tmp).unwrap_err();
        assert!(matches!(err, TyperError::RegionMalformed { .. }));
        let _ = std::fs::remove_file(&tmp);
    }
}
