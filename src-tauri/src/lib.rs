pub mod calibrate;
pub mod file_io;
mod json_log;
pub mod lint;
pub mod log_commands;
pub mod permissions;
pub mod persist;
pub mod send;
mod send_state;
pub mod validation;
pub mod verify;

use std::path::PathBuf;

pub(crate) fn default_log_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("dev.autumnfallenwang.keystream")
        .join("logs")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let is_debug = cfg!(debug_assertions);
    let log_level = if is_debug {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    // Initialize JSON file logger BEFORE Tauri builder so plugin init is captured.
    // File at appDataDir/logs/app.log (see default_log_dir()).
    let log_path = default_log_dir().join("app.log");
    json_log::JsonFileLogger::new(
        log_path.clone(),
        if is_debug {
            log::Level::Debug
        } else {
            log::Level::Info
        },
        is_debug,
    )
    .init(log_level);

    log::info!("app_version={}", env!("CARGO_PKG_VERSION"));
    log::info!("log_file={}", log_path.display());
    log::info!("build={}", if is_debug { "debug" } else { "release" });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri::Manager;
            app.manage(send_state::SendState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            log_commands::log_info,
            log_commands::log_warn,
            log_commands::log_error,
            log_commands::open_log_dir,
            calibrate::calibrate,
            calibrate::get_region,
            calibrate::clear_region,
            file_io::read_text_file,
            lint::check_lines,
            permissions::check_permissions,
            permissions::open_settings_pane,
            persist::save_text,
            persist::get_text,
            persist::clear_text,
            send::send_with_chunked_verify,
            send::continue_after_fail,
            send::stop_send,
            verify::verify_visible,
            verify::scroll_verify,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
