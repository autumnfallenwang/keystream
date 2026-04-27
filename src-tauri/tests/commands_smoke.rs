//! Integration smoke for Tauri commands. Confirms each
//! `#[tauri::command]` is publicly accessible through `keystream_lib`
//! and behaves correctly at the integration-test boundary.
//!
//! Coverage scope (per task 31):
//! - Compile-time signature checks for all 10 commands via the
//!   `_signature_checks` no-call function. A regression that removes
//!   an underlying fn while keeping it in `generate_handler!` fails
//!   to compile here.
//! - Public-API roundtrip for the 4 directly-callable commands
//!   (`lint::check_lines`, `log_commands::log_{info,warn,error}`).
//! - Pure-helper accessibility (`parse_picker_stdout`, validation).
//!
//! NOT covered here (intentional):
//! - `send_with_chunked_verify` orchestration loop. Needs a Tauri
//!   runtime or a dependency-injection refactor; end-to-end coverage
//!   lives in task 47 (live-AVD smoke).
//! - `calibrate` / `get_region` / `clear_region` / `verify_visible` /
//!   `scroll_verify` / `send::*` runtime behavior. All take
//!   `AppHandle` or `State<'_, T>` which aren't constructible without
//!   a Tauri runtime. The signature checks below confirm they exist.

use keystream_lib::validation::MAX_TEXT_BYTES;

#[test]
fn check_lines_rejects_oversized_text_via_public_api() {
    let big = "a".repeat(MAX_TEXT_BYTES + 1);
    assert!(keystream_lib::lint::check_lines(big).is_err());
}

#[test]
fn check_lines_accepts_normal_text_via_public_api() {
    let result = keystream_lib::lint::check_lines("hello\nworld".to_string()).unwrap();
    assert!(result.ok);
}

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
fn parse_picker_stdout_via_public_api() {
    let region = keystream_lib::calibrate::parse_picker_stdout("100 200 300 400\n").unwrap();
    assert_eq!(region.x, 100);
    assert_eq!(region.y, 200);
    assert_eq!(region.w, 300);
    assert_eq!(region.h, 400);
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

// ---- Compile-time signature checks for runtime-only commands ----
// Never called. Forces the compiler to verify each function exists.
// A regression that drops an underlying fn (e.g. removing
// `send::stop_send` while keeping it in `generate_handler!`) would
// fail to compile here, before any test runs.
#[allow(dead_code)]
fn _signature_checks() {
    // The exact signatures of these async commands are complex (they
    // include `State<'_, _>`, `Channel<_>`, etc.). We only care that
    // the items exist by these paths — `let _ = item;` is enough to
    // prove that.
    let _ = keystream_lib::calibrate::calibrate;
    let _ = keystream_lib::calibrate::get_region;
    let _ = keystream_lib::calibrate::clear_region;
    let _ = keystream_lib::file_io::read_text_file;
    let _ = keystream_lib::verify::verify_visible;
    let _ = keystream_lib::verify::scroll_verify;
    let _ = keystream_lib::send::send_with_chunked_verify;
    let _ = keystream_lib::send::continue_after_fail;
    let _ = keystream_lib::send::stop_send;
    let _ = keystream_lib::log_commands::open_log_dir;
    let _ = keystream_lib::permissions::check_permissions;
    let _ = keystream_lib::permissions::open_settings_pane;
    let _ = keystream_lib::persist::save_text;
    let _ = keystream_lib::persist::get_text;
    let _ = keystream_lib::persist::clear_text;
}
