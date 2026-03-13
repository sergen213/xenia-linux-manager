pub mod commands;
pub mod jobs;
pub mod settings;
pub mod xenia;

use std::sync::Arc;

use commands::jobs as jobs_commands;
use commands::settings as settings_commands;
use commands::xenia as xenia_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(jobs::JobRegistry::new()))
        .invoke_handler(tauri::generate_handler![
            settings_commands::get_default_settings,
            settings_commands::load_settings,
            settings_commands::save_settings,
            settings_commands::validate_paths,
            jobs_commands::load_task_history,
            jobs_commands::get_task_history,
            jobs_commands::clear_task_history,
            xenia_commands::fetch_latest_release,
            xenia_commands::check_for_update,
            xenia_commands::start_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
