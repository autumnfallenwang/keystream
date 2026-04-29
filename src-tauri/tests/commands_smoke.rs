//! Integration smoke for v2 Tauri commands. Confirms each
//! `#[tauri::command]` is publicly accessible through `keystream_lib`
//! and behaves correctly at the integration-test boundary.
//!
//! Coverage scope (v2-3):
//! - Compile-time signature checks for all 15 commands via the
//!   `_signature_checks` no-call function. A regression that removes
//!   an underlying fn while keeping it in `generate_handler!` fails
//!   to compile here.
//! - Public-API roundtrip for the directly-callable commands
//!   (`log_commands::log_*`, `file_io::read_text_file`,
//!   `permissions::open_settings_pane`).
//!
//! NOT covered here (intentional):
//! - `send::run_send` orchestration loop. Needs a Tauri runtime and a
//!   real `RealEventSource`; end-to-end coverage lives in the manual
//!   RDP smoke per `progress.md`.
//! - `send::pause_send` / `send::stop_send` runtime behavior. Take
//!   `State<'_, SendState>` which isn't constructible without a Tauri
//!   runtime. Signature checks below confirm they exist.
//! - `settings::{get,save}_settings` runtime behavior. Take
//!   `AppHandle`. Inline tests in `settings.rs` cover the file-level
//!   `load_at` / `save_at` helpers.

use keystream_lib::validation::MAX_TEXT_BYTES;

#[test]
fn log_info_rejects_oversized_message_via_public_api() {
    let big = "x".repeat(MAX_TEXT_BYTES + 1);
    assert!(keystream_lib::log_commands::log_info(big).is_err());
}

#[test]
fn log_warn_rejects_oversized_message_via_public_api() {
    let big = "x".repeat(MAX_TEXT_BYTES + 1);
    assert!(keystream_lib::log_commands::log_warn(big).is_err());
}

#[test]
fn log_error_rejects_oversized_message_via_public_api() {
    let big = "x".repeat(MAX_TEXT_BYTES + 1);
    assert!(keystream_lib::log_commands::log_error(big).is_err());
}

#[test]
fn validation_helpers_visible_through_public_api() {
    assert!(keystream_lib::validation::validate_text_size("ok", "label").is_ok());
}

#[test]
fn read_text_file_roundtrip_via_public_api() {
    let path = std::env::temp_dir().join("kstest_smoke_read_text_file.txt");
    std::fs::write(&path, "hello\nworld").unwrap();
    let result =
        keystream_lib::file_io::read_text_file(path.to_string_lossy().into_owned()).unwrap();
    assert_eq!(result, "hello\nworld");
    let _ = std::fs::remove_file(&path);
}

#[test]
fn open_settings_pane_rejects_unknown_via_public_api() {
    let err = keystream_lib::permissions::open_settings_pane("garbage".into()).unwrap_err();
    assert!(err.contains("unknown settings pane"), "got: {err}");
}

#[test]
fn open_settings_pane_rejects_screen_recording_via_public_api() {
    // v1 used to accept "screenRecording"; v2 dropped it (no OCR
    // pipeline → no Screen Recording grant needed).
    let err = keystream_lib::permissions::open_settings_pane("screenRecording".into()).unwrap_err();
    assert!(err.contains("unknown settings pane"), "got: {err}");
}

#[test]
fn check_permissions_returns_accessibility_field() {
    // Smoke test: the FFI call works and returns a Permissions struct.
    // Whether `accessibility` is true depends on the test environment,
    // so we only assert the field is reachable.
    let p = keystream_lib::permissions::check_permissions();
    let _ = p.accessibility;
}

#[test]
fn settings_default_via_public_api() {
    use keystream_lib::settings::SettingsCfg;
    use typer_core::config::{COUNTDOWN_SECS, EVENT_PAUSE_MS, MOD_HOLD_MS};
    let cfg = SettingsCfg::default();
    assert_eq!(cfg.event_pause_ms, EVENT_PAUSE_MS);
    assert_eq!(cfg.mod_hold_ms, MOD_HOLD_MS);
    assert_eq!(cfg.countdown_secs, COUNTDOWN_SECS);
}

#[test]
fn read_folder_tree_roundtrip_via_public_api() {
    let dir = std::env::temp_dir().join("kstest_smoke_read_folder_tree");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("a.txt"), b"").unwrap();
    std::fs::write(dir.join("b.md"), b"").unwrap();
    let tree =
        keystream_lib::folder_tree::read_folder_tree(dir.to_string_lossy().into_owned()).unwrap();
    assert_eq!(tree.children.len(), 2);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn state_default_via_public_api() {
    use keystream_lib::state::AppStateCfg;
    let cfg = AppStateCfg::default();
    assert!(cfg.last_folder.is_none());
    assert!(cfg.selected_file.is_none());
    assert!(cfg.expanded_paths.is_empty());
}

// ---- Compile-time signature checks for runtime-only commands ----
// Never called. Forces the compiler to verify each function exists.
// A regression that drops an underlying fn (e.g. removing
// `send::stop_send` while keeping it in `generate_handler!`) would
// fail to compile here, before any test runs.
#[allow(dead_code)]
fn _signature_checks() {
    let _ = keystream_lib::file_io::read_text_file;
    let _ = keystream_lib::log_commands::log_info;
    let _ = keystream_lib::log_commands::log_warn;
    let _ = keystream_lib::log_commands::log_error;
    let _ = keystream_lib::log_commands::open_log_dir;
    let _ = keystream_lib::permissions::check_permissions;
    let _ = keystream_lib::permissions::open_settings_pane;
    let _ = keystream_lib::persist::save_text;
    let _ = keystream_lib::persist::get_text;
    let _ = keystream_lib::persist::clear_text;
    let _ = keystream_lib::settings::get_settings;
    let _ = keystream_lib::settings::save_settings;
    let _ = keystream_lib::send::run_send;
    let _ = keystream_lib::send::pause_send;
    let _ = keystream_lib::send::stop_send;
    let _ = keystream_lib::folder_tree::read_folder_tree;
    let _ = keystream_lib::state::get_state;
    let _ = keystream_lib::state::save_state;
}
