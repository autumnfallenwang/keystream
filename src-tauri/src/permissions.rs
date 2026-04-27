//! macOS permission probe + System Settings deep-link (task 42).
//!
//! Two stable Apple APIs reached via `extern "C"`:
//! - `AXIsProcessTrusted()` — Accessibility (ApplicationServices, since 10.9).
//! - `CGPreflightScreenCaptureAccess()` — Screen Recording (CoreGraphics,
//!   since 10.15). Silent preflight — no prompt.
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
    pub screen_recording: bool,
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
}

/// Probe both required permissions. Silent — neither call prompts.
#[tauri::command]
pub fn check_permissions() -> Permissions {
    // SAFETY: both are stable Apple APIs that take no arguments and return
    // a primitive `bool`. No memory ownership or threading concerns.
    let accessibility = unsafe { AXIsProcessTrusted() };
    let screen_recording = unsafe { CGPreflightScreenCaptureAccess() };
    log::info!(
        "check_permissions: accessibility={accessibility} screenRecording={screen_recording}"
    );
    Permissions {
        accessibility,
        screen_recording,
    }
}

/// Open the System Settings pane for the named privacy section. The pane
/// name is validated against a small allowlist to defeat URL injection.
#[tauri::command]
pub fn open_settings_pane(pane: String) -> Result<(), String> {
    let url = match pane.as_str() {
        "accessibility" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
        "screenRecording" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
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
}
