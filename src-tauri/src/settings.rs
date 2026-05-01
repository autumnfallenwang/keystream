//! User settings persistence (Q13 four-dial UI + Q15 appearance shell
//! + Q19 sidebar width).
//!
//! Path: `<app_data_dir>/settings.json`. Schema is `SettingsCfg`. Read
//! at startup; written on every change in the v2-5 / v2-7 / v2-9 UI.
//!
//! Defaults are pulled from `typer_core::config` constants — single
//! source of truth. The settings UI in the frontend mirrors these values.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use typer_core::config::{COUNTDOWN_SECS, DEFAULT_WARMUP_SHIFT, EVENT_PAUSE_MS, MOD_HOLD_MS};

/// Q19 default sidebar width in pixels. Range 180..=600 enforced
/// frontend-side via `clampSidebarWidth`. Matches the
/// `SIDEBAR_WIDTH_DEFAULT` constant in `src/lib/core/sidebar-width.ts`.
const DEFAULT_SIDEBAR_WIDTH_PX: u64 = 260;

fn default_sidebar_width_px() -> u64 {
    DEFAULT_SIDEBAR_WIDTH_PX
}

/// Q15 appearance config — palette profile, light/dark/system mode,
/// proportional UI scale. Q22 — `editor_font_size` (in CSS pixels) is
/// independent: the text panel is exempted from the UI zoom, so its
/// size has its own dial. The frontend is the source of truth for
/// valid `profile` and `mode` strings; the backend stores them
/// opaquely.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceCfg {
    pub profile: String,
    pub mode: String,
    pub font_size: f32,
    /// Editor font size in CSS pixels. `#[serde(default = ...)]` for
    /// back-compat: pre-Q22 settings.json files (without the field)
    /// load with the default 13.
    #[serde(default = "default_editor_font_size")]
    pub editor_font_size: u32,
}

fn default_editor_font_size() -> u32 {
    13
}

impl Default for AppearanceCfg {
    fn default() -> Self {
        Self {
            profile: "atelier".into(),
            mode: "system".into(),
            font_size: 1.0,
            editor_font_size: default_editor_font_size(),
        }
    }
}

/// Q13 4-dial config + Q15 appearance. Three of the four timing fields
/// (event_pause_ms, mod_hold_ms, warmup_shift) map onto
/// `typer_core::SendCfg` for the send loop; `countdown_secs` is consumed
/// by the frontend's pre-send overlay.
///
/// `appearance` is `#[serde(default)]` so v2-5 settings.json files
/// (without the field) load cleanly with default appearance applied.
/// `sidebar_width_px` is `#[serde(default = ...)]` for the same
/// back-compat reason — v2-7-era files load with 260 applied.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsCfg {
    pub event_pause_ms: u64,
    pub mod_hold_ms: u64,
    pub warmup_shift: bool,
    pub countdown_secs: u64,
    #[serde(default)]
    pub appearance: AppearanceCfg,
    #[serde(default = "default_sidebar_width_px")]
    pub sidebar_width_px: u64,
}

impl Default for SettingsCfg {
    fn default() -> Self {
        Self {
            event_pause_ms: EVENT_PAUSE_MS,
            mod_hold_ms: MOD_HOLD_MS,
            warmup_shift: DEFAULT_WARMUP_SHIFT,
            countdown_secs: COUNTDOWN_SECS,
            appearance: AppearanceCfg::default(),
            sidebar_width_px: DEFAULT_SIDEBAR_WIDTH_PX,
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
        "get_settings: event_pause_ms={} mod_hold_ms={} warmup_shift={} countdown_secs={} appearance.profile={} appearance.mode={} appearance.font_size={} appearance.editor_font_size={} sidebar_width_px={}",
        cfg.event_pause_ms,
        cfg.mod_hold_ms,
        cfg.warmup_shift,
        cfg.countdown_secs,
        cfg.appearance.profile,
        cfg.appearance.mode,
        cfg.appearance.font_size,
        cfg.appearance.editor_font_size,
        cfg.sidebar_width_px,
    );
    Ok(cfg)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, cfg: SettingsCfg) -> Result<(), String> {
    let path = settings_path(&app)?;
    save_at(&path, &cfg)?;
    log::info!(
        "save_settings: event_pause_ms={} mod_hold_ms={} warmup_shift={} countdown_secs={} appearance.profile={} appearance.mode={} appearance.font_size={} appearance.editor_font_size={} sidebar_width_px={}",
        cfg.event_pause_ms,
        cfg.mod_hold_ms,
        cfg.warmup_shift,
        cfg.countdown_secs,
        cfg.appearance.profile,
        cfg.appearance.mode,
        cfg.appearance.font_size,
        cfg.appearance.editor_font_size,
        cfg.sidebar_width_px,
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
    fn default_includes_appearance_defaults() {
        let cfg = SettingsCfg::default();
        assert_eq!(cfg.appearance.profile, "atelier");
        assert_eq!(cfg.appearance.mode, "system");
        assert!((cfg.appearance.font_size - 1.0).abs() < f32::EPSILON);
        assert_eq!(cfg.appearance.editor_font_size, 13);
    }

    #[test]
    fn serde_roundtrip_preserves_values() {
        let cfg = SettingsCfg {
            event_pause_ms: 8,
            mod_hold_ms: 12,
            warmup_shift: false,
            countdown_secs: 5,
            appearance: AppearanceCfg {
                profile: "solarized".into(),
                mode: "light".into(),
                font_size: 1.15,
                editor_font_size: 16,
            },
            sidebar_width_px: 320,
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
        assert!(json.get("appearance").is_some());
    }

    #[test]
    fn serde_emits_camel_case_appearance_keys() {
        let cfg = SettingsCfg::default();
        let json = serde_json::to_value(&cfg).unwrap();
        let appearance = json.get("appearance").unwrap();
        assert!(appearance.get("profile").is_some());
        assert!(appearance.get("mode").is_some());
        assert!(appearance.get("fontSize").is_some());
        assert!(appearance.get("editorFontSize").is_some());
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
            appearance: AppearanceCfg {
                profile: "nord".into(),
                mode: "dark".into(),
                font_size: 1.3,
                editor_font_size: 18,
            },
            sidebar_width_px: 420,
        };
        save_at(&path, &original).unwrap();
        let loaded = load_at(&path).unwrap();
        assert_eq!(loaded, original);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn load_at_back_compat_with_missing_appearance() {
        // Files written by v2-5 (before the appearance field existed)
        // should load cleanly with the default appearance applied.
        let path = tmp("v2_5_format.json");
        let v2_5_json = r#"{
            "eventPauseMs": 8,
            "modHoldMs": 12,
            "warmupShift": false,
            "countdownSecs": 5
        }"#;
        fs::write(&path, v2_5_json).unwrap();
        let loaded = load_at(&path).unwrap();
        assert_eq!(loaded.event_pause_ms, 8);
        assert_eq!(loaded.mod_hold_ms, 12);
        assert!(!loaded.warmup_shift);
        assert_eq!(loaded.countdown_secs, 5);
        assert_eq!(loaded.appearance, AppearanceCfg::default());
        // v2-5 files predate sidebar_width_px too — should default.
        assert_eq!(loaded.sidebar_width_px, DEFAULT_SIDEBAR_WIDTH_PX);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn default_includes_sidebar_width_default() {
        let cfg = SettingsCfg::default();
        assert_eq!(cfg.sidebar_width_px, 260);
    }

    #[test]
    fn serde_emits_camel_case_sidebar_width() {
        let cfg = SettingsCfg::default();
        let json = serde_json::to_value(&cfg).unwrap();
        assert!(json.get("sidebarWidthPx").is_some());
        assert_eq!(json["sidebarWidthPx"], 260);
    }

    #[test]
    fn serde_roundtrip_preserves_sidebar_width() {
        let cfg = SettingsCfg {
            sidebar_width_px: 320,
            ..SettingsCfg::default()
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let back: SettingsCfg = serde_json::from_str(&json).unwrap();
        assert_eq!(back.sidebar_width_px, 320);
    }

    #[test]
    fn load_at_back_compat_with_missing_sidebar_width() {
        // Files written by v2-7 (before sidebar_width_px existed) should
        // load cleanly with the 260 default applied.
        let path = tmp("v2_7_format.json");
        let v2_7_json = r#"{
            "eventPauseMs": 8,
            "modHoldMs": 12,
            "warmupShift": false,
            "countdownSecs": 5,
            "appearance": {
                "profile": "solarized",
                "mode": "light",
                "fontSize": 1.15
            }
        }"#;
        fs::write(&path, v2_7_json).unwrap();
        let loaded = load_at(&path).unwrap();
        assert_eq!(loaded.sidebar_width_px, DEFAULT_SIDEBAR_WIDTH_PX);
        // Other fields preserved.
        assert_eq!(loaded.event_pause_ms, 8);
        assert_eq!(loaded.appearance.profile, "solarized");
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
