//! End-to-end protocol tests: spawn the real xlm-core binary and talk NDJSON.

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

/// Spawn xlm-core, send each request line, return collected stdout lines until
/// `want_lines` have arrived (or the pipe closes).
fn run_lines(requests: &[&str], want_lines: usize) -> Vec<serde_json::Value> {
    let mut child = Command::new(env!("CARGO_BIN_EXE_xlm-core"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn xlm-core");

    {
        let stdin = child.stdin.as_mut().unwrap();
        for r in requests {
            writeln!(stdin, "{r}").unwrap();
        }
        stdin.flush().unwrap();
    }

    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    let mut out = Vec::new();
    for line in reader.lines() {
        let line = line.unwrap();
        if line.trim().is_empty() {
            continue;
        }
        out.push(serde_json::from_str::<serde_json::Value>(&line).unwrap());
        if out.len() >= want_lines {
            break;
        }
    }
    let _ = child.kill();
    out
}

#[test]
fn emits_ready_then_answers_ping() {
    let lines = run_lines(&[r#"{"id":"1","method":"ping","params":{}}"#], 2);
    assert_eq!(lines[0]["kind"], "event");
    assert_eq!(lines[0]["event"], "ready");
    assert!(lines[0]["payload"]["version"].is_string());

    assert_eq!(lines[1]["kind"], "response");
    assert_eq!(lines[1]["id"], "1");
    assert_eq!(lines[1]["ok"], true);
    assert_eq!(lines[1]["result"], "pong");
}

#[test]
fn unknown_method_returns_error() {
    let lines = run_lines(&[r#"{"id":"9","method":"does_not_exist","params":{}}"#], 2);
    let resp = &lines[1];
    assert_eq!(resp["ok"], false);
    assert!(resp["error"].as_str().unwrap().contains("unknown method"));
}

#[test]
fn known_methods_are_not_unknown() {
    // Sending with empty params may produce a param error, but never "unknown method".
    for m in [
        "get_default_settings",
        "load_settings",
        "save_settings",
        "validate_paths",
        "list_game_profiles",
        "create_game_profile",
        "rename_game_profile",
        "delete_game_profile",
        "select_active_game_profile",
        "get_profile_effective_config",
        "save_profile_overrides",
        "apply_recommended_profile",
        "load_task_history",
        "clear_task_history",
        "get_release_metadata",
        "get_updater_readiness",
        "get_environment_diagnostics",
        "check_patches_status",
        "deploy_game_patches",
        "get_game_xenia_patches",
        "toggle_xenia_patch_entry",
        "import_xenia_patch_file",
        "get_export_preflight",
        "export_save_archive",
        "inspect_save_archive",
        "get_import_conflict_plan",
        "apply_save_import",
        "cleanup_save_import_staging",
        "list_save_backups",
        // xenia pure
        "fetch_latest_release",
        "fetch_recent_releases",
        "get_install_status",
        "check_for_update_auto",
        "clear_install_failure",
        "cleanup_install_artifacts",
        "switch_active_xenia_build",
        "remove_xenia_install",
        // library pure
        "add_library_source",
        "remove_library_source",
        "get_all_catalogs",
        "browse_library",
        "get_library_game_details",
        "create_manual_game",
        "update_library_game_identity",
        "update_preferred_xenia_build",
        "update_game_launch_environment",
        "update_game_launch_wrapper",
        "get_launch_preflight",
        "launch_library_game",
        "export_game_desktop_shortcut",
        "get_shortcut_locations",
        "inspect_game_content",
        "import_game_content",
        "remove_game_content",
        "fetch_game_artwork",
        "fetch_all_artwork",
        "detect_steam_install",
        "export_game_to_steam",
        // shell
        "open_path",
        // xenia stateful
        "start_install",
        "start_update",
        "retry_last_operation",
        // library stateful
        "start_source_scan",
        "scan_all_sources",
        "get_library_status",
    ] {
        let req = format!(r#"{{"id":"t","method":"{m}","params":{{}}}}"#);
        let lines = run_lines(&[&req], 2);
        let resp = &lines[1];
        if resp["ok"] == false {
            assert!(
                !resp["error"].as_str().unwrap().contains("unknown method"),
                "method {m} routed as unknown"
            );
        }
    }
}

#[test]
fn start_install_emits_job_created() {
    let tmp = std::env::temp_dir().join("xlm_test_install");
    let _ = std::fs::create_dir_all(&tmp);
    let p = tmp.to_string_lossy();
    // Minimal LinuxRelease with all required fields; channel is defaulted so may be omitted.
    let release = r#"{"tag":"0","release_name":"test","build_id":"canary:0","published_at":"","html_url":"","asset_name":"x.zip","download_url":"http://127.0.0.1:9/none","size_bytes":0}"#;
    let req = format!(
        r#"{{"id":"i1","method":"start_install","params":{{"xeniaPath":"{p}","appDataPath":"{p}","release":{release}}}}}"#
    );
    // Collect several lines: ready + job:created + response (order of the last two may vary).
    let lines = run_lines(&[&req], 4);
    let kinds: Vec<String> = lines.iter().map(|l| l["event"].as_str().unwrap_or(l["kind"].as_str().unwrap_or("")).to_string()).collect();
    assert!(kinds.iter().any(|k| k == "job:created"), "expected a job:created event, got {kinds:?}");
}
