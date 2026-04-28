//! macOS permission probe + System Settings deep-link.
//!
//! v2 only needs Accessibility (to post CGEvents). Screen Recording was
//! a v1 OCR-pipeline requirement; with poc2's Q12 fix typing is byte-
//! perfect and OCR-verify is gone, so the screen-recording grant is no
//! longer relevant.
//!
//! Reached via `extern "C"`:
//! - `AXIsProcessTrusted()` — Accessibility (ApplicationServices, since 10.9).
//!
//! Per `rules/security.md`: this command is read-only — no permissions to
//! escalate, no Tauri allowlist surface beyond a safe enum-validated
//! `open_settings_pane`.

#![cfg(target_os = "macos")]

use serde::Serialize;

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    pub accessibility: bool,
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

/// Probe Accessibility. Silent — does not prompt.
#[tauri::command]
pub fn check_permissions() -> Permissions {
    // SAFETY: stable Apple API, takes no arguments, returns a primitive
    // `bool`. No memory ownership or threading concerns.
    let accessibility = unsafe { AXIsProcessTrusted() };
    log::info!("check_permissions: accessibility={accessibility}");
    Permissions { accessibility }
}

/// Open the System Settings pane for the named privacy section. The pane
/// name is validated against a small allowlist to defeat URL injection.
/// v2 only allows "accessibility" — "screenRecording" is rejected since
/// the screen-recording grant is no longer needed.
#[tauri::command]
pub fn open_settings_pane(pane: String) -> Result<(), String> {
    let url = match pane.as_str() {
        "accessibility" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
        other => return Err(format!("unknown settings pane: {other}")),
    };
    log::info!("open_settings_pane: pane={pane}");
    open::that(url).map_err(|e| format!("failed to open Settings: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_settings_pane_rejects_unknown_pane() {
        let err = open_settings_pane("garbage".into()).unwrap_err();
        assert!(err.contains("unknown settings pane"), "got: {err}");
    }

    #[test]
    fn open_settings_pane_rejects_empty_string() {
        let err = open_settings_pane("".into()).unwrap_err();
        assert!(err.contains("unknown settings pane"), "got: {err}");
    }

    #[test]
    fn open_settings_pane_rejects_screen_recording() {
        // v1 used to accept "screenRecording"; v2 removed the grant
        // requirement and tightens the allowlist accordingly.
        let err = open_settings_pane("screenRecording".into()).unwrap_err();
        assert!(err.contains("unknown settings pane"), "got: {err}");
    }

    #[test]
    fn permissions_serializes_with_camel_case_field() {
        let p = Permissions {
            accessibility: true,
        };
        let json = serde_json::to_value(p).unwrap();
        assert_eq!(json["accessibility"], true);
    }
}
