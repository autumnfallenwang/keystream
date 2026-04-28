//! User settings persistence (Q13 four-dial UI).
//!
//! Path: `<app_data_dir>/settings.json`. Schema is `SettingsCfg`. Read
//! at startup; written on every change in the v2-5 settings UI.
//!
//! Defaults are pulled from `typer_core::config` constants — single
//! source of truth. The settings UI in the frontend mirrors these values.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use typer_core::config::{COUNTDOWN_SECS, DEFAULT_WARMUP_SHIFT, EVENT_PAUSE_MS, MOD_HOLD_MS};

/// Q13 4-dial config. Three of the four (event_pause_ms, mod_hold_ms,
/// warmup_shift) map onto `typer_core::SendCfg` for the send loop;
/// `countdown_secs` is consumed by the frontend's pre-send overlay
/// (Q14: countdown fires on Send and Resume).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsCfg {
    pub event_pause_ms: u64,
    pub mod_hold_ms: u64,
    pub warmup_shift: bool,
    pub countdown_secs: u64,
}

impl Default for SettingsCfg {
    fn default() -> Self {
        Self {
            event_pause_ms: EVENT_PAUSE_MS,
            mod_hold_ms: MOD_HOLD_MS,
            warmup_shift: DEFAULT_WARMUP_SHIFT,
            countdown_secs: COUNTDOWN_SECS,
        }
    }
}

const SETTINGS_FILE: &str = "settings.json";

/// Build `<app_data_dir>/settings.json`.
pub(crate) fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join(SETTINGS_FILE))
        .map_err(|e| format!("app_data_dir: {e}"))
}

/// Load settings from `path`. Missing file returns the defaults
/// (normal first-launch state); malformed JSON returns an error.
pub(crate) fn load_at(path: &Path) -> Result<SettingsCfg, String> {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(SettingsCfg::default());
        }
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };
    serde_json::from_slice(&bytes).map_err(|e| format!("parse {}: {e}", path.display()))
}

/// Write settings to `path`, creating the parent dir if needed.
pub(crate) fn save_at(path: &Path, cfg: &SettingsCfg) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all {}: {e}", parent.display()))?;
    }
    let json = serde_json::to_vec_pretty(cfg).map_err(|e| format!("serialize SettingsCfg: {e}"))?;
    fs::write(path, &json).map_err(|e| format!("write {}: {e}", path.display()))
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<SettingsCfg, String> {
    let path = settings_path(&app)?;
    let cfg = load_at(&path)?;
    log::info!(
        "get_settings: event_pause_ms={} mod_hold_ms={} warmup_shift={} countdown_secs={}",
        cfg.event_pause_ms,
        cfg.mod_hold_ms,
        cfg.warmup_shift,
        cfg.countdown_secs,
    );
    Ok(cfg)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, cfg: SettingsCfg) -> Result<(), String> {
    let path = settings_path(&app)?;
    save_at(&path, &cfg)?;
    log::info!(
        "save_settings: event_pause_ms={} mod_hold_ms={} warmup_shift={} countdown_secs={}",
        cfg.event_pause_ms,
        cfg.mod_hold_ms,
        cfg.warmup_shift,
        cfg.countdown_secs,
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("kstest_settings_{name}"))
    }

    #[test]
    fn default_matches_typer_core_constants() {
        let cfg = SettingsCfg::default();
        assert_eq!(cfg.event_pause_ms, EVENT_PAUSE_MS);
        assert_eq!(cfg.mod_hold_ms, MOD_HOLD_MS);
        assert_eq!(cfg.warmup_shift, DEFAULT_WARMUP_SHIFT);
        assert_eq!(cfg.countdown_secs, COUNTDOWN_SECS);
    }

    #[test]
    fn serde_roundtrip_preserves_values() {
        let cfg = SettingsCfg {
            event_pause_ms: 8,
            mod_hold_ms: 12,
            warmup_shift: false,
            countdown_secs: 5,
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let back: SettingsCfg = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg, back);
    }

    #[test]
    fn serde_emits_camel_case_keys() {
        let cfg = SettingsCfg::default();
        let json = serde_json::to_value(&cfg).unwrap();
        assert!(json.get("eventPauseMs").is_some());
        assert!(json.get("modHoldMs").is_some());
        assert!(json.get("warmupShift").is_some());
        assert!(json.get("countdownSecs").is_some());
    }

    #[test]
    fn load_at_returns_default_when_missing() {
        let path = tmp("missing.json");
        let _ = fs::remove_file(&path);
        let cfg = load_at(&path).unwrap();
        assert_eq!(cfg, SettingsCfg::default());
    }

    #[test]
    fn save_then_load_roundtrip() {
        let path = tmp("roundtrip.json");
        let original = SettingsCfg {
            event_pause_ms: 7,
            mod_hold_ms: 15,
            warmup_shift: true,
            countdown_secs: 4,
        };
        save_at(&path, &original).unwrap();
        let loaded = load_at(&path).unwrap();
        assert_eq!(loaded, original);
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
