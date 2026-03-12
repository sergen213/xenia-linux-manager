pub mod commands;
pub mod jobs;
pub mod settings;

use commands::jobs as jobs_commands;
use commands::settings as settings_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            settings_commands::get_default_settings,
            settings_commands::load_settings,
            settings_commands::save_settings,
            settings_commands::validate_paths,
            jobs_commands::load_task_history,
            jobs_commands::get_task_history,
            jobs_commands::clear_task_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
