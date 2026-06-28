use crate::profiles::sources;
use crate::profiles::storage;

pub fn list_game_profiles(
    library_metadata_path: String,
    game_id: String,
) -> Result<storage::ProfileInventory, String> {
    storage::load_inventory(&library_metadata_path, &game_id)
}

pub fn create_game_profile(
    library_metadata_path: String,
    game_id: String,
    name: String,
) -> Result<storage::ProfileInventory, String> {
    storage::create_profile(&library_metadata_path, &game_id, &name)
}

pub fn rename_game_profile(
    library_metadata_path: String,
    game_id: String,
    profile_id: String,
    new_name: String,
) -> Result<storage::ProfileInventory, String> {
    storage::rename_profile(&library_metadata_path, &game_id, &profile_id, &new_name)
}

pub fn delete_game_profile(
    library_metadata_path: String,
    game_id: String,
    profile_id: String,
) -> Result<storage::ProfileInventory, String> {
    storage::delete_profile(&library_metadata_path, &game_id, &profile_id)
}

pub fn select_active_game_profile(
    library_metadata_path: String,
    game_id: String,
    profile_id: Option<String>,
) -> Result<storage::ProfileInventory, String> {
    storage::select_active_profile(&library_metadata_path, &game_id, profile_id.as_deref())
}

pub fn get_profile_effective_config(
    library_metadata_path: String,
    game_id: String,
    profile_id: String,
) -> Result<crate::profiles::merge::EffectiveConfig, String> {
    crate::profiles::merge::compute_effective_config(&library_metadata_path, &game_id, &profile_id)
}

pub fn save_profile_overrides(
    library_metadata_path: String,
    game_id: String,
    profile_id: String,
    overrides: std::collections::HashMap<String, serde_json::Value>,
) -> Result<storage::ProfileDocument, String> {
    storage::save_profile_overrides(&library_metadata_path, &game_id, &profile_id, overrides)
}

// ---------------------------------------------------------------------------
// Recommendation commands
// ---------------------------------------------------------------------------

pub fn apply_recommended_profile(
    library_metadata_path: String,
    game_id: String,
    profile_name: Option<String>,
) -> Result<storage::ProfileInventory, String> {
    let availability = sources::recommendation_availability(&game_id);
    sources::apply_recommendation(
        &library_metadata_path,
        &game_id,
        &availability,
        profile_name.as_deref(),
    )
}
