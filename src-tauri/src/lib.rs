pub mod commands;
pub mod jobs;
pub mod library;
pub mod settings;
pub mod xenia;

use std::sync::Arc;

use commands::jobs as jobs_commands;
use commands::library as library_commands;
use commands::settings as settings_commands;
use commands::xenia as xenia_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(jobs::JobRegistry::new()))
        .manage(Arc::new(library::scan_jobs::ScanCoordinator::new()))
        .invoke_handler(tauri::generate_handler![
            settings_commands::get_default_settings,
            settings_commands::load_settings,
            settings_commands::save_settings,
            settings_commands::validate_paths,
            jobs_commands::load_task_history,
            jobs_commands::get_task_history,
            jobs_commands::clear_task_history,
            xenia_commands::fetch_latest_release,
            xenia_commands::get_install_status,
            xenia_commands::check_for_update,
            xenia_commands::check_for_update_auto,
            xenia_commands::start_install,
            xenia_commands::start_update,
            xenia_commands::retry_last_operation,
            xenia_commands::clear_install_failure,
            xenia_commands::cleanup_install_artifacts,
            xenia_commands::remove_xenia_install,
            library_commands::add_library_source,
            library_commands::list_library_sources,
            library_commands::remove_library_source,
            library_commands::start_source_scan,
            library_commands::scan_all_sources,
            library_commands::cancel_scan,
            library_commands::get_library_status,
            library_commands::get_source_catalog,
            library_commands::get_all_catalogs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
