pub mod commands;
pub mod jobs;
pub mod library;
pub mod patches;
pub mod profiles;
pub mod release;
pub mod saves;
pub mod settings;
pub mod xenia;

use std::sync::Arc;

use commands::jobs as jobs_commands;
use commands::library as library_commands;
use commands::patches as patches_commands;
use commands::profiles as profiles_commands;
use commands::saves as saves_commands;
use commands::settings as settings_commands;
use commands::release as release_commands;
use commands::xenia as xenia_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
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
            library_commands::browse_library,
            library_commands::get_review_inbox,
            library_commands::get_library_game_details,
            library_commands::create_manual_game,
            library_commands::update_library_game_identity,
            library_commands::resolve_duplicate_review,
            library_commands::fetch_game_artwork,
            library_commands::fetch_all_artwork,
            library_commands::get_launch_preflight,
            library_commands::get_launch_preflight_with_profile,
            library_commands::launch_library_game,
            patches_commands::check_patches_status,
            patches_commands::deploy_game_patches,
            patches_commands::get_game_xenia_patches,
            patches_commands::toggle_xenia_patch_entry,
            patches_commands::list_xenia_community_patch_candidates,
            patches_commands::fetch_xenia_community_patch,
            patches_commands::import_xenia_patch_file,
            profiles_commands::list_game_profiles,
            profiles_commands::create_game_profile,
            profiles_commands::rename_game_profile,
            profiles_commands::delete_game_profile,
            profiles_commands::select_active_game_profile,
            profiles_commands::get_profile_effective_config,
            profiles_commands::save_profile_overrides,
            profiles_commands::get_materialized_launch_config,
            profiles_commands::check_recommendation_availability,
            profiles_commands::apply_recommended_profile,
            saves_commands::get_export_preflight,
            saves_commands::export_save_archive,
            saves_commands::inspect_save_archive,
            saves_commands::get_import_conflict_plan,
            saves_commands::apply_save_import,
            saves_commands::cleanup_save_import_staging,
            saves_commands::list_save_backups,
            release_commands::get_release_metadata,
            release_commands::get_updater_readiness,
            release_commands::get_environment_diagnostics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
