use std::path::PathBuf;

const PATCHES_DIRNAME: &str = "patches";

pub fn patch_root_dir(library_metadata_path: &str, game_id: &str) -> PathBuf {
    PathBuf::from(library_metadata_path)
        .join(PATCHES_DIRNAME)
        .join(game_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_patch_root_dir_under_library_metadata() {
        let path = patch_root_dir("/tmp/library", "game-1");
        assert_eq!(
            path,
            PathBuf::from("/tmp/library").join("patches").join("game-1")
        );
    }
}
