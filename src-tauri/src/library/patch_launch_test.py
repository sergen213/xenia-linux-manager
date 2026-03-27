import sys
with open('src-tauri/src/library/launch.rs', 'r') as f:
    text = f.read()

import re

# Fix seed_game_with_confidence
match = re.search(r'fn seed_game_with_confidence\([^}]+\}\n\}', text, re.DOTALL)
if match:
    old_fn = match.group(0)
    new_fn = r'''fn seed_game_with_confidence(
    app_dir: &Path,
    lib_dir: &Path,
    executable_path: &str,
    kind: CandidateKind,
    confidence: Confidence,
) -> String {
    let source = crate::library::discovery::ScanSource {
        id: "test-source".to_string(),
        label: "Test Source".to_string(),
        paths: vec![lib_dir.to_string_lossy().into()],
        include_isos: true,
        include_unpacked: true,
    };
    crate::settings::save_library_sources(app_dir, &[source.clone()]).unwrap();

    let candidate = DiscoveredCandidate {
        path: executable_path.into(),
        source_id: source.id.clone(),
        label: "Halo 3".to_string(),
        discovered_at: 0,
        kind,
        confidence,
        status: crate::library::discovery::CandidateStatus::Found,
        warning: None,
    };
    let catalog = crate::library::catalog::Catalog {
        source: source.clone(),
        candidates: vec![candidate],
        summary: crate::library::catalog::ScanSummary {
            scanned: 1,
            found: 1,
            duplicates: 0,
            warnings: 0,
            completed_at: 0,
        },
    };
    crate::library::catalog::save_catalog(lib_dir, &catalog).unwrap();

    let mut store = crate::library::identity::load_identity_store(lib_dir);
    let game_id = crate::library::identity::ensure_scan_game_record(
        &mut store,
        &source.id,
        "Halo 3",
        executable_path,
    );
    crate::library::identity::save_identity_store(lib_dir, &store).unwrap();

    let state = InstallState {
        status: LifecycleStatus::Installed,
        manifest: Some(InstallManifest {
            tag: "canary".into(),
            published_at: "2026-01-01T00:00:00Z".into(),
            asset_name: "xenia.tar.gz".into(),
            executable_path: "/bin/echo".into(),
            install_dir: "/opt/xenia".into(),
            installed_at: 100,
        }),
        installed_builds: vec![],
        failure: None,
    };
    install_state::save_state(app_dir, &state).unwrap();
    game_id
}'''
    text = text.replace(old_fn, new_fn)

# Clean up any previously injected code
text = re.sub(r'let mut store = crate::.*?crate::library::identity::save_identity_store.*?;\n\s+let browse = review::browse_library\(lib_dir\);\n\s+let game_id = browse\.cards\[0\]\.game_id\.clone\(\);', '', text, flags=re.DOTALL)
text = re.sub(r'let mut store = crate::.*?crate::library::identity::save_identity_store.*?;', '', text, flags=re.DOTALL)

with open('src-tauri/src/library/launch.rs', 'w') as f:
    f.write(text)
