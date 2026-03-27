import sys
with open('src-tauri/src/profiles/merge.rs', 'r') as f:
    text = f.read()

text = text.replace(
'''    // Look up provenance metadata from the manifest.
    let manifest = storage::load_manifest(library_metadata_path, game_id)?;
    let record = manifest.profiles.iter().find(|p| p.id == profile_id);''',
'''    // Look up provenance metadata from the manifest.
    let inventory = storage::load_inventory(library_metadata_path, game_id)?;
    let record = inventory.profiles.iter().find(|p| p.id == profile_id);'''
)

with open('src-tauri/src/profiles/merge.rs', 'w') as f:
    f.write(text)
