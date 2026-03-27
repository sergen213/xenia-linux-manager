import sys
with open('src-tauri/src/profiles/materialize.rs', 'r') as f:
    text = f.read()

text = text.replace(
'''    // Load the active profile and compute effective config.
    let manifest = storage::load_manifest(library_metadata_path, game_id)?;
    let (profile_id, profile_name, effective_fields, explicit_overrides, changed_count) =
        match &manifest.active_profile_id {
            Some(pid) => {
                let record = manifest.profiles.iter().find(|p| p.id == *pid);
                let name = record.map(|r| r.name.clone());''',
'''    // Load the active profile and compute effective config.
    let manifest = storage::load_manifest(library_metadata_path, game_id)?;
    let inventory = storage::load_inventory(library_metadata_path, game_id)?;
    let (profile_id, profile_name, effective_fields, explicit_overrides, changed_count) =
        match &manifest.active_profile_id {
            Some(pid) => {
                let record = inventory.profiles.iter().find(|p| p.id == *pid);
                let name = record.map(|r| r.name.clone());'''
)

with open('src-tauri/src/profiles/materialize.rs', 'w') as f:
    f.write(text)
