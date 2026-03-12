pub mod commands;
pub mod settings;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
