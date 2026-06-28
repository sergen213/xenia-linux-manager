//! Backend-owned launch preflight and process spawning.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::process::{Child, Command};

use crate::events::EventSink;
use crate::util::now_millis;
use crate::library::identity;
use crate::library::review;
use crate::patches::xenia_patches;
use crate::profiles::materialize::{self, MaterializedLaunchConfig};
use crate::settings;
use crate::xenia::install_state::{self, LifecycleStatus};
use crate::xenia::releases::ReleaseChannel;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LaunchPreflight {
    pub game_id: String,
    pub game_title: String,
    pub game_executable_path: String,
    pub xenia_executable_path: Option<String>,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub can_launch: bool,
    pub requires_confirmation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LaunchResult {
    pub game_id: String,
    pub started_at: u64,
    pub pid: u32,
}

/// Emitted (as the `game:exited` sidecar event) once the Xenia child process
/// closes, so the UI can clear "now playing" state and refresh last-played.
#[derive(Debug, Clone, Serialize)]
struct GameExitedPayload {
    game_id: String,
    pid: u32,
    exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LaunchPlan {
    pub xenia_executable_path: String,
    pub game_executable_path: String,
    pub config_path: String,
    pub launch_arguments: Vec<String>,
    pub environment: Vec<(String, String)>,
    pub wrapper: Vec<String>,
}

pub fn get_launch_preflight(
    app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
) -> Result<LaunchPreflight, String> {
    let details = review::load_game_details(library_metadata_path, game_id)?;
    let install = install_state::load_state(app_data_path);
    let xenia_exec = resolve_xenia_executable(&install, details.preferred_xenia_tag.as_deref());

    let mut blockers = Vec::new();
    let mut warnings = Vec::new();

    if install.status != LifecycleStatus::Installed || xenia_exec.is_none() {
        blockers.push("Xenia is not installed yet.".to_string());
    }
    if details.executable_path.trim().is_empty() {
        blockers.push("No executable path is stored for this game.".to_string());
    } else if !Path::new(&details.executable_path).exists() {
        blockers.push("The stored executable path does not exist on disk.".to_string());
    }
    if details.review_flag || details.duplicate_count > 0 {
        blockers.push("This title still has unresolved review work.".to_string());
    }
    if details.kind == "iso" && details.confidence == "low" {
        blockers.push("This source shape is still too uncertain to launch safely.".to_string());
    }

    if details.manual {
        warnings
            .push("This title was added manually. Double-check the executable path.".to_string());
    }
    if details.confidence != "high" && details.kind != "manual" {
        warnings.push("Scan confidence is below high.".to_string());
    }
    if !details.issue_notes.is_empty() {
        warnings.push("This title has issue notes that may affect launch quality.".to_string());
    }

    let can_launch = blockers.is_empty();
    Ok(LaunchPreflight {
        game_id: details.game_id,
        game_title: details.title,
        game_executable_path: details.executable_path,
        xenia_executable_path: xenia_exec,
        can_launch,
        requires_confirmation: can_launch && !warnings.is_empty(),
        blockers,
        warnings,
    })
}

pub fn build_launch_plan(
    app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
) -> Result<LaunchPlan, String> {
    let preflight = get_launch_preflight(app_data_path, library_metadata_path, game_id)?;
    if !preflight.can_launch {
        return Err(preflight.blockers.join(" "));
    }

    let xenia_exec = preflight
        .xenia_executable_path
        .clone()
        .ok_or_else(|| "Missing Xenia executable path".to_string())?;
    let details = review::load_game_details(library_metadata_path, game_id)?;
    let storage_root = xenia_patches::get_xenia_storage_root(app_data_path)?;

    // Ensure patches are enabled in the main config
    let _ = xenia_patches::ensure_apply_patches_enabled(app_data_path);

    let materialized =
        materialize::materialize_launch_config(app_data_path, library_metadata_path, game_id)?;
    let launch_config_path = if let Some(title_id) = details.title_id.as_deref() {
        write_game_launch_config(&storage_root, title_id, &materialized)?
    } else {
        write_external_launch_config(app_data_path, game_id, &materialized)?
    };
    let mut launch_env = load_launch_environment(library_metadata_path, game_id)?;
    // Xenia Canary's bundled SDL auto-selects the Wayland video driver whenever
    // WAYLAND_DISPLAY is set, which renders a blank gray window. Pin it to X11
    // (XWayland) so Canary actually draws. Edge is unaffected. A user-set
    // SDL_VIDEODRIVER always wins.
    let install = install_state::load_state(app_data_path);
    let channel = resolve_xenia_build(&install, details.preferred_xenia_tag.as_deref())
        .map(|build| build.channel);
    if should_force_x11(channel, &launch_env) {
        launch_env.push(("SDL_VIDEODRIVER".to_string(), "x11".to_string()));
    }
    let launch_wrapper = load_launch_wrapper(library_metadata_path, game_id)?;

    let mut launch_arguments = Vec::new();
    // Always pass --config so Xenia reads the profile-based config directly,
    // rather than relying on auto-discovery which may use a cached/global config
    // that takes precedence over the game-specific config file.
    launch_arguments.push(format!("--config={}", launch_config_path.to_string_lossy()));

    Ok(LaunchPlan {
        xenia_executable_path: xenia_exec,
        game_executable_path: preflight.game_executable_path,
        config_path: launch_config_path.to_string_lossy().to_string(),
        launch_arguments,
        environment: launch_env,
        wrapper: launch_wrapper,
    })
}

pub fn launch_game(
    app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
    allow_warnings: bool,
    events: &EventSink,
) -> Result<LaunchResult, String> {
    let preflight = get_launch_preflight(app_data_path, library_metadata_path, game_id)?;
    if !preflight.can_launch {
        return Err(preflight.blockers.join(" "));
    }
    if preflight.requires_confirmation && !allow_warnings {
        return Err("Launch confirmation required for this title.".to_string());
    }

    let plan = build_launch_plan(app_data_path, library_metadata_path, game_id)?;

    let mut command = if let Some(program) = plan.wrapper.first() {
        let mut cmd = Command::new(program);
        cmd.args(&plan.wrapper[1..]);
        cmd.arg(&plan.xenia_executable_path);
        cmd
    } else {
        Command::new(&plan.xenia_executable_path)
    };

    let child = command
        .envs(plan.environment.clone())
        .args(&plan.launch_arguments)
        .arg(&plan.game_executable_path)
        .spawn()
        .map_err(|e| format!("Failed to launch Xenia: {e}"))?;
    let pid = child.id();

    // Watch the child on a detached thread so the UI learns when the game
    // closes (return focus to the app, refresh last-played) instead of
    // treating launch as fire-and-forget.
    let sink = events.clone();
    let exited_game_id = game_id.to_string();
    std::thread::spawn(move || watch_child_exit(&sink, exited_game_id, pid, child));

    let started_at = now_millis();
    let _ = identity::record_launch_started(
        library_metadata_path,
        game_id,
        &plan.xenia_executable_path,
    )?;
    Ok(LaunchResult {
        game_id: game_id.to_string(),
        started_at,
        pid,
    })
}

/// Block on the Xenia child until it exits, then emit `game:exited`.
/// Reaps the child (avoids a zombie) and reports the exit code when available.
fn watch_child_exit(sink: &EventSink, game_id: String, pid: u32, mut child: Child) {
    let exit_code = child.wait().ok().and_then(|status| status.code());
    sink.emit_event(
        "game:exited",
        &GameExitedPayload {
            game_id,
            pid,
            exit_code,
        },
    );
}

fn load_launch_environment(
    library_metadata_path: &str,
    game_id: &str,
) -> Result<Vec<(String, String)>, String> {
    let settings = settings::load_settings().map_err(|e| e.to_string())?;
    let mut merged = HashMap::new();
    for (key, value) in parse_launch_environment(&settings.launch_environment)? {
        merged.insert(key, value);
    }

    let store = identity::load_identity_store(library_metadata_path);
    let game = identity::find_game_by_id(&store, game_id)
        .ok_or_else(|| format!("Game not found: {}", game_id))?;
    if let Some(raw) = &game.launch_environment {
        for (key, value) in parse_launch_environment(raw)? {
            merged.insert(key, value);
        }
    }

    Ok(merged.into_iter().collect())
}

fn parse_launch_environment(raw: &str) -> Result<Vec<(String, String)>, String> {
    let mut envs = Vec::new();

    for (index, original_line) in raw.lines().enumerate() {
        let line = original_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            return Err(format!(
                "Invalid launch environment entry on line {}: expected KEY=VALUE",
                index + 1
            ));
        };

        let key = key.trim();
        let value = value.trim();
        if key.is_empty() {
            return Err(format!(
                "Invalid launch environment entry on line {}: variable name is empty",
                index + 1
            ));
        }
        if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err(format!(
                "Invalid launch environment variable name on line {}: {}",
                index + 1,
                key
            ));
        }

        envs.push((key.to_string(), value.to_string()));
    }

    Ok(envs)
}

fn load_launch_wrapper(library_metadata_path: &str, game_id: &str) -> Result<Vec<String>, String> {
    let settings = settings::load_settings().map_err(|e| e.to_string())?;
    let mut tokens = parse_launch_wrapper(&settings.launch_wrapper)?;

    let store = identity::load_identity_store(library_metadata_path);
    let game = identity::find_game_by_id(&store, game_id)
        .ok_or_else(|| format!("Game not found: {}", game_id))?;
    if let Some(raw) = &game.launch_wrapper {
        tokens.extend(parse_launch_wrapper(raw)?);
    }

    Ok(tokens)
}

fn parse_launch_wrapper(raw: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut chars = raw.trim().chars().peekable();

    while let Some(ch) = chars.next() {
        match quote {
            Some(q) if ch == q => quote = None,
            Some(_) => current.push(ch),
            None if ch == '\'' || ch == '"' => quote = Some(ch),
            None if ch.is_whitespace() => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            None => current.push(ch),
        }
    }

    if quote.is_some() {
        return Err("Invalid launch wrapper: unmatched quote".to_string());
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    Ok(tokens)
}

/// Resolve which installed build a launch will use: the preferred tag if it
/// matches one, otherwise the active manifest. Returns the manifest so callers
/// can read both the executable path and the channel.
fn resolve_xenia_build<'a>(
    install: &'a install_state::InstallState,
    preferred_tag: Option<&str>,
) -> Option<&'a install_state::InstallManifest> {
    preferred_tag
        .and_then(|preferred| {
            install
                .installed_builds
                .iter()
                .find(|build| build.build_id == preferred || build.tag == preferred)
        })
        .or(install.manifest.as_ref())
}

fn resolve_xenia_executable(
    install: &install_state::InstallState,
    preferred_tag: Option<&str>,
) -> Option<String> {
    resolve_xenia_build(install, preferred_tag).map(|build| build.executable_path.clone())
}

/// Whether to pin SDL to the X11 driver for this launch. Only Xenia Canary
/// needs it (its bundled SDL renders a blank window under Wayland); a
/// user-provided SDL_VIDEODRIVER always takes precedence.
fn should_force_x11(channel: Option<ReleaseChannel>, env: &[(String, String)]) -> bool {
    channel == Some(ReleaseChannel::Canary) && !env.iter().any(|(k, _)| k == "SDL_VIDEODRIVER")
}

fn write_external_launch_config(
    app_data_path: &str,
    game_id: &str,
    materialized: &MaterializedLaunchConfig,
) -> Result<std::path::PathBuf, String> {
    let dir = std::path::PathBuf::from(app_data_path).join("launch-configs");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create launch config directory: {e}"))?;
    let path = dir.join(format!("{game_id}.toml"));
    let toml = materialized_config_to_toml(materialized)?;
    write_file_synced(&path, &toml)?;
    Ok(path)
}

fn write_game_launch_config(
    xenia_dir: &Path,
    title_id: &str,
    materialized: &MaterializedLaunchConfig,
) -> Result<std::path::PathBuf, String> {
    let dir = xenia_dir.join("config");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create Xenia game config directory: {e}"))?;
    let path = dir.join(format!("{title_id}.config.toml"));
    let toml = materialized_config_to_toml(materialized)?;
    write_file_synced(&path, &toml)?;
    Ok(path)
}

fn write_file_synced(path: &std::path::Path, contents: &str) -> Result<(), String> {
    use std::io::Write;
    let mut file =
        std::fs::File::create(path).map_err(|e| format!("Failed to create file: {e}"))?;
    file.write_all(contents.as_bytes())
        .map_err(|e| format!("Failed to write file: {e}"))?;
    file.sync_all()
        .map_err(|e| format!("Failed to sync file: {e}"))?;
    Ok(())
}

fn materialized_config_to_toml(materialized: &MaterializedLaunchConfig) -> Result<String, String> {
    let mut root = toml::map::Map::new();
    for (key, value) in &materialized.explicit_overrides {
        let translated = translate_profile_key_to_xenia_config(key);
        insert_dotted_toml_value(&mut root, &translated, json_to_toml_value(value)?);
    }

    // Ensure patches are enabled by default (required for patches to apply)
    if !root.contains_key("apply_patches") {
        root.insert("apply_patches".to_string(), toml::Value::Boolean(true));
    }

    // Launch fullscreen by default for a console-like experience. A profile can
    // opt back into windowed mode by explicitly setting display.fullscreen=false.
    let has_fullscreen = root
        .get("Display")
        .and_then(|display| display.as_table())
        .map(|display| display.contains_key("fullscreen"))
        .unwrap_or(false);
    if !has_fullscreen {
        insert_dotted_toml_value(&mut root, "Display.fullscreen", toml::Value::Boolean(true));
    }

    let toml_str = toml::to_string_pretty(&toml::Value::Table(root))
        .map_err(|e| format!("Failed to serialize launch config TOML: {e}"))?;
    Ok(toml_str)
}

fn translate_profile_key_to_xenia_config(key: &str) -> String {
    match key {
        // Acronym backends remap the leaf to the bare acronym; the rest fall
        // through to the category-name normalizer below.
        "apu.backend" => "APU.apu".to_string(),
        "cpu.backend" => "CPU.cpu".to_string(),
        "cpu.break_on_unimplemented" => "CPU.break_on_unimplemented_instructions".to_string(),
        "gpu.backend" => "GPU.gpu".to_string(),
        _ => {
            let mut parts = key.split('.');
            let category = parts.next().unwrap_or_default();
            let remainder = parts.collect::<Vec<_>>().join(".");
            if remainder.is_empty() {
                to_xenia_category_name(category)
            } else {
                format!("{}.{}", to_xenia_category_name(category), remainder)
            }
        }
    }
}

fn to_xenia_category_name(category: &str) -> String {
    match category {
        "apu" => "APU".to_string(),
        "cpu" => "CPU".to_string(),
        "gpu" => "GPU".to_string(),
        "hid" => "HID".to_string(),
        other => {
            let mut chars = other.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
                None => String::new(),
            }
        }
    }
}

fn insert_dotted_toml_value(
    root: &mut toml::map::Map<String, toml::Value>,
    dotted_key: &str,
    value: toml::Value,
) {
    let parts: Vec<&str> = dotted_key.split('.').collect();
    insert_dotted_parts(root, &parts, value);
}

fn insert_dotted_parts(
    root: &mut toml::map::Map<String, toml::Value>,
    parts: &[&str],
    value: toml::Value,
) {
    if parts.is_empty() {
        return;
    }
    if parts.len() == 1 {
        root.insert(parts[0].to_string(), value);
        return;
    }

    let entry = root
        .entry(parts[0].to_string())
        .or_insert_with(|| toml::Value::Table(toml::map::Map::new()));
    if !entry.is_table() {
        *entry = toml::Value::Table(toml::map::Map::new());
    }
    let table = entry.as_table_mut().expect("table just inserted");
    insert_dotted_parts(table, &parts[1..], value);
}

fn json_to_toml_value(value: &serde_json::Value) -> Result<toml::Value, String> {
    match value {
        serde_json::Value::Null => {
            Err("Null values cannot be written to launch config".to_string())
        }
        serde_json::Value::Bool(v) => Ok(toml::Value::Boolean(*v)),
        serde_json::Value::Number(v) => {
            if let Some(i) = v.as_i64() {
                Ok(toml::Value::Integer(i))
            } else if let Some(f) = v.as_f64() {
                Ok(toml::Value::Float(f))
            } else {
                Err(format!("Unsupported numeric value in launch config: {v}"))
            }
        }
        serde_json::Value::String(v) => Ok(toml::Value::String(v.clone())),
        serde_json::Value::Array(values) => {
            let mut array = Vec::with_capacity(values.len());
            for item in values {
                array.push(json_to_toml_value(item)?);
            }
            Ok(toml::Value::Array(array))
        }
        serde_json::Value::Object(map) => {
            let mut table = toml::map::Map::new();
            for (key, item) in map {
                table.insert(key.clone(), json_to_toml_value(item)?);
            }
            Ok(toml::Value::Table(table))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::catalog::{save_catalog, CatalogScanSummary, SourceCatalog};
    use crate::library::discovery::{
        CandidateKind, CandidateStatus, Confidence, DiscoveredCandidate,
    };
    use crate::library::sources;
    use crate::xenia::install_state::{self, InstallManifest, InstallState};
    use crate::xenia::releases::ReleaseChannel;
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(suffix: &str) -> String {
        let path = env::temp_dir().join("xlm-library-launch").join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn force_x11_only_for_canary_without_user_override() {
        let empty: Vec<(String, String)> = vec![];
        // Canary with no user driver → pin X11.
        assert!(should_force_x11(Some(ReleaseChannel::Canary), &empty));
        // Edge never needs it.
        assert!(!should_force_x11(Some(ReleaseChannel::Edge), &empty));
        // Unknown/uninstalled build → leave env alone.
        assert!(!should_force_x11(None, &empty));
        // User already chose a driver → respect it, even on Canary.
        let user = vec![("SDL_VIDEODRIVER".to_string(), "wayland".to_string())];
        assert!(!should_force_x11(Some(ReleaseChannel::Canary), &user));
    }

    fn seed_game(app_dir: &str, lib_dir: &str, executable_path: &str) -> String {
        let source_root = PathBuf::from(lib_dir).join("games");
        fs::create_dir_all(&source_root).unwrap();
        let source = sources::add_source(lib_dir, source_root.to_string_lossy().as_ref()).unwrap();
        save_catalog(
            lib_dir,
            &SourceCatalog {
                source_id: source.source.id.clone(),
                candidates: vec![DiscoveredCandidate {
                    path: PathBuf::from(executable_path),
                    label: "Halo 3".into(),
                    source_id: source.source.id.clone(),
                    kind: CandidateKind::Xex,
                    confidence: Confidence::High,
                    status: CandidateStatus::Found,
                    size_bytes: 1024,
                    warning: None,
                    discovered_at: 100,
                }],
                last_scan_summary: Some(CatalogScanSummary {
                    found: 1,
                    duplicates: 0,
                    warnings: 0,
                    skipped: 0,
                    errors: 0,
                    status: "completed".into(),
                    completed_at: 100,
                    was_cancelled: false,
                }),
            },
        )
        .unwrap();
        let browse = review::browse_library(lib_dir);
        let game_id = browse.cards[0].game_id.clone();

        let state = InstallState {
            status: LifecycleStatus::Installed,
            manifest: Some(InstallManifest {
                channel: ReleaseChannel::Canary,
                build_id: crate::xenia::releases::LinuxRelease::build_id_for(
                    ReleaseChannel::Canary,
                    "canary",
                ),
                tag: "canary".into(),
                release_name: "canary".into(),
                published_at: "2026-01-01T00:00:00Z".into(),
                html_url: "https://example.com/canary".into(),
                asset_name: "xenia.tar.gz".into(),
                executable_path: "/bin/echo".into(),
                install_dir: "/opt/xenia".into(),
                installed_at: 100,
            }),
            failure: None,
            installed_builds: vec![],
        };
        install_state::save_state(app_dir, &state).unwrap();
        game_id
    }

    #[test]
    fn parse_launch_environment_accepts_comments_and_values() {
        let envs =
            parse_launch_environment("# comment\nMANGOHUD=1\nMANGOHUD_CONFIG=fps,gpu_temp\n")
                .unwrap();
        assert_eq!(
            envs,
            vec![
                ("MANGOHUD".to_string(), "1".to_string()),
                ("MANGOHUD_CONFIG".to_string(), "fps,gpu_temp".to_string()),
            ]
        );
    }

    #[test]
    fn parse_launch_environment_rejects_invalid_lines() {
        let err = parse_launch_environment("not-valid").unwrap_err();
        assert!(err.contains("expected KEY=VALUE"));
    }

    #[test]
    fn materialized_config_serializes_explicit_overrides_to_toml() {
        let mut overrides = HashMap::new();
        overrides.insert("gpu.vsync".to_string(), serde_json::json!(false));
        overrides.insert("gpu.framerate_limit".to_string(), serde_json::json!(60));
        let materialized = MaterializedLaunchConfig {
            game_id: "game-1".into(),
            explicit_overrides: overrides,
        };

        let toml = materialized_config_to_toml(&materialized).unwrap();
        assert!(toml.contains("[GPU]"));
        assert!(toml.contains("vsync = false"));
        assert!(toml.contains("framerate_limit = 60"));
    }

    fn materialized_with(overrides: HashMap<String, serde_json::Value>) -> MaterializedLaunchConfig {
        MaterializedLaunchConfig {
            game_id: "game-1".into(),
            explicit_overrides: overrides,
        }
    }

    #[test]
    fn launch_config_defaults_to_fullscreen() {
        let toml = materialized_config_to_toml(&materialized_with(HashMap::new())).unwrap();
        assert!(toml.contains("[Display]"));
        assert!(toml.contains("fullscreen = true"));
    }

    #[test]
    fn explicit_windowed_override_is_preserved() {
        let mut overrides = HashMap::new();
        overrides.insert("display.fullscreen".to_string(), serde_json::json!(false));
        let toml = materialized_config_to_toml(&materialized_with(overrides)).unwrap();
        assert!(toml.contains("fullscreen = false"));
        assert!(!toml.contains("fullscreen = true"));
    }

    #[test]
    fn game_exit_emits_event() {
        // `true` exits 0 immediately; watch it synchronously and assert the event.
        let child = Command::new("true").spawn().unwrap();
        let pid = child.id();
        let sink = EventSink::capture();
        watch_child_exit(&sink, "game-1".into(), pid, child);

        let lines = sink.captured();
        assert_eq!(lines.len(), 1);
        let v: serde_json::Value = serde_json::from_str(&lines[0]).unwrap();
        assert_eq!(v["event"], "game:exited");
        assert_eq!(v["payload"]["game_id"], "game-1");
        assert_eq!(v["payload"]["exit_code"], 0);
    }

    #[test]
    fn profile_keys_are_translated_to_xenia_config_keys() {
        assert_eq!(
            translate_profile_key_to_xenia_config("gpu.backend"),
            "GPU.gpu"
        );
        assert_eq!(
            translate_profile_key_to_xenia_config("cpu.backend"),
            "CPU.cpu"
        );
        assert_eq!(
            translate_profile_key_to_xenia_config("cpu.break_on_unimplemented"),
            "CPU.break_on_unimplemented_instructions"
        );
    }

    #[test]
    fn parse_launch_wrapper_supports_quoted_args() {
        let tokens =
            parse_launch_wrapper("gamescope --fullscreen --prefer-vk-device \"RADV Radeon\" --")
                .unwrap();
        assert_eq!(
            tokens,
            vec![
                "gamescope",
                "--fullscreen",
                "--prefer-vk-device",
                "RADV Radeon",
                "--"
            ]
        );
    }

    #[test]
    fn preflight_blocks_missing_game_path() {
        let app_dir = temp_dir("app-block");
        let lib_dir = temp_dir("lib-block");
        let game_id = seed_game(&app_dir, &lib_dir, "/does/not/exist/default.xex");

        let preflight = get_launch_preflight(&app_dir, &lib_dir, &game_id).unwrap();
        assert!(!preflight.can_launch);
        assert!(preflight
            .blockers
            .iter()
            .any(|blocker| blocker.contains("does not exist")));
    }
}
