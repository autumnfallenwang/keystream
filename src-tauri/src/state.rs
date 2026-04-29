//! Ephemeral session state persistence (Q18) — sibling to `settings.rs`.
//!
//! Path: `<app_data_dir>/state.json`. Schema is `AppStateCfg`. Tracks
//! the user's last-opened folder, currently-selected file, and the set
//! of expanded folder paths, so the file explorer can restore session
//! context across launches.
//!
//! Separated from `settings.json` because state is ephemeral context
//! (per-session), not user preference. Every field is `#[serde(default)]`
//! so future schema additions stay back-compat.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateCfg {
    #[serde(default)]
    pub last_folder: Option<String>,
    #[serde(default)]
    pub selected_file: Option<String>,
    #[serde(default)]
    pub expanded_paths: Vec<String>,
}

const STATE_FILE: &str = "state.json";

pub(crate) fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join(STATE_FILE))
        .map_err(|e| format!("app_data_dir: {e}"))
}

pub(crate) fn load_at(path: &Path) -> Result<AppStateCfg, String> {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(AppStateCfg::default());
        }
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };
    serde_json::from_slice(&bytes).map_err(|e| format!("parse {}: {e}", path.display()))
}

pub(crate) fn save_at(path: &Path, cfg: &AppStateCfg) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all {}: {e}", parent.display()))?;
    }
    let json = serde_json::to_vec_pretty(cfg).map_err(|e| format!("serialize AppStateCfg: {e}"))?;
    fs::write(path, &json).map_err(|e| format!("write {}: {e}", path.display()))
}

#[tauri::command]
pub fn get_state(app: AppHandle) -> Result<AppStateCfg, String> {
    let path = state_path(&app)?;
    let cfg = load_at(&path)?;
    log::info!(
        "get_state: has_last_folder={} has_selected_file={} expanded_count={}",
        cfg.last_folder.is_some(),
        cfg.selected_file.is_some(),
        cfg.expanded_paths.len()
    );
    Ok(cfg)
}

#[tauri::command]
pub fn save_state(app: AppHandle, cfg: AppStateCfg) -> Result<(), String> {
    let path = state_path(&app)?;
    save_at(&path, &cfg)?;
    log::info!(
        "save_state: has_last_folder={} has_selected_file={} expanded_count={}",
        cfg.last_folder.is_some(),
        cfg.selected_file.is_some(),
        cfg.expanded_paths.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("kstest_state_{name}"))
    }

    #[test]
    fn default_is_empty() {
        let cfg = AppStateCfg::default();
        assert!(cfg.last_folder.is_none());
        assert!(cfg.selected_file.is_none());
        assert!(cfg.expanded_paths.is_empty());
    }

    #[test]
    fn serde_roundtrip() {
        let cfg = AppStateCfg {
            last_folder: Some("/Users/me/proj".into()),
            selected_file: Some("/Users/me/proj/a.ts".into()),
            expanded_paths: vec!["/Users/me/proj/src".into(), "/Users/me/proj/src/lib".into()],
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let back: AppStateCfg = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg, back);
    }

    #[test]
    fn serde_emits_camel_case_keys() {
        let cfg = AppStateCfg {
            last_folder: Some("/x".into()),
            selected_file: Some("/x/y".into()),
            expanded_paths: vec!["/x".into()],
        };
        let json = serde_json::to_value(&cfg).unwrap();
        assert!(json.get("lastFolder").is_some());
        assert!(json.get("selectedFile").is_some());
        assert!(json.get("expandedPaths").is_some());
    }

    #[test]
    fn load_at_returns_default_when_missing() {
        let path = tmp("missing.json");
        let _ = fs::remove_file(&path);
        let cfg = load_at(&path).unwrap();
        assert_eq!(cfg, AppStateCfg::default());
    }

    #[test]
    fn save_then_load_roundtrip() {
        let path = tmp("roundtrip.json");
        let original = AppStateCfg {
            last_folder: Some("/tmp/foo".into()),
            selected_file: None,
            expanded_paths: vec!["/tmp/foo/src".into()],
        };
        save_at(&path, &original).unwrap();
        let loaded = load_at(&path).unwrap();
        assert_eq!(loaded, original);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn load_at_back_compat_with_partial_json() {
        // An older / partial state.json with only a subset of fields.
        let path = tmp("partial.json");
        fs::write(&path, b"{}").unwrap();
        let loaded = load_at(&path).unwrap();
        assert_eq!(loaded, AppStateCfg::default());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn load_at_back_compat_with_extra_keys() {
        // Future schema versions add fields; older code should ignore them.
        let path = tmp("extra.json");
        fs::write(
            &path,
            br#"{ "lastFolder": "/x", "futureField": 42, "anotherField": ["nope"] }"#,
        )
        .unwrap();
        let loaded = load_at(&path).unwrap();
        assert_eq!(loaded.last_folder, Some("/x".into()));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn load_at_errors_on_malformed_json() {
        let path = tmp("malformed.json");
        fs::write(&path, b"this is not json").unwrap();
        let err = load_at(&path).unwrap_err();
        assert!(err.contains("parse"), "got: {err}");
        let _ = fs::remove_file(&path);
    }
}
