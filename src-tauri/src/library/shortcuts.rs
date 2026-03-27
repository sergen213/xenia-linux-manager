use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::library::launch;
use crate::library::review;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopShortcutExportResult {
    pub desktop_file_path: String,
    pub desktop_entry_name: String,
    pub target: String,
    pub overwritten: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopShortcutLocations {
    pub applications_dir: String,
    pub desktop_dir: String,
}

pub fn export_game_desktop_shortcut(
    app_data_path: &str,
    library_metadata_path: &str,
    game_id: &str,
    target: &str,
) -> Result<DesktopShortcutExportResult, String> {
    let preflight = launch::get_launch_preflight(app_data_path, library_metadata_path, game_id)?;
    if !preflight.can_launch {
        return Err(preflight.blockers.join(" "));
    }

    let details = review::load_game_details(library_metadata_path, game_id)?;
    let plan = launch::build_launch_plan(app_data_path, library_metadata_path, game_id)?;

    let destination_dir = shortcut_target_dir(target)?;
    fs::create_dir_all(&destination_dir)
        .map_err(|e| format!("Failed to create shortcut directory: {e}"))?;

    let slug = slugify(&details.title);
    let desktop_file_name = format!("xenia-manager-{}.desktop", slug);
    let desktop_file_path = destination_dir.join(&desktop_file_name);
    let overwritten = desktop_file_path.exists();
    let entry_name = format!("{} (Xenia)", details.title);

    let mut desktop = String::new();
    desktop.push_str("[Desktop Entry]\n");
    desktop.push_str("Type=Application\n");
    desktop.push_str(&format!("Name={}\n", escape_desktop_value(&entry_name)));
    desktop.push_str(&format!(
        "Comment={}\n",
        escape_desktop_value("Launch this Xbox 360 game with Xenia")
    ));
    let exec_command = desktop_exec_command(&plan);
    desktop.push_str(&format!("Exec={}\n", exec_command));
    desktop.push_str("Terminal=false\n");
    desktop.push_str("Categories=Game;Emulator;\n");
    desktop.push_str("StartupNotify=true\n");

    if let Some(icon_path) = details
        .artwork_path
        .as_ref()
        .filter(|p| Path::new(p).exists())
    {
        desktop.push_str(&format!("Icon={}\n", escape_desktop_value(icon_path)));
    }

    fs::write(&desktop_file_path, desktop)
        .map_err(|e| format!("Failed to write desktop shortcut: {e}"))?;
    set_executable_permissions(&desktop_file_path)?;

    Ok(DesktopShortcutExportResult {
        desktop_file_path: desktop_file_path.to_string_lossy().to_string(),
        desktop_entry_name: entry_name,
        target: target.to_string(),
        overwritten,
    })
}

pub fn get_shortcut_locations() -> Result<DesktopShortcutLocations, String> {
    Ok(DesktopShortcutLocations {
        applications_dir: applications_dir()?.to_string_lossy().to_string(),
        desktop_dir: desktop_dir()?.to_string_lossy().to_string(),
    })
}

fn shortcut_target_dir(target: &str) -> Result<PathBuf, String> {
    match target {
        "applications" => applications_dir(),
        "desktop" => desktop_dir(),
        other => Err(format!("Unknown shortcut target: {other}")),
    }
}

fn applications_dir() -> Result<PathBuf, String> {
    if let Ok(xdg_data_home) = std::env::var("XDG_DATA_HOME") {
        if !xdg_data_home.trim().is_empty() {
            return Ok(PathBuf::from(xdg_data_home).join("applications"));
        }
    }

    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    Ok(PathBuf::from(home).join(".local/share/applications"))
}

fn desktop_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;

    let user_dirs = PathBuf::from(&home).join(".config/user-dirs.dirs");
    if let Ok(contents) = fs::read_to_string(&user_dirs) {
        for line in contents.lines() {
            let trimmed = line.trim();
            if !trimmed.starts_with("XDG_DESKTOP_DIR=") {
                continue;
            }
            let raw = trimmed
                .split_once('=')
                .map(|(_, value)| value.trim())
                .unwrap_or("\"$HOME/Desktop\"");
            let cleaned = raw.trim_matches('"').replace("$HOME", &home);
            if !cleaned.trim().is_empty() {
                return Ok(PathBuf::from(cleaned));
            }
        }
    }

    Ok(PathBuf::from(home).join("Desktop"))
}

fn set_executable_permissions(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(path)
            .map_err(|e| format!("Failed to read desktop shortcut metadata: {e}"))?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions)
            .map_err(|e| format!("Failed to mark desktop shortcut executable: {e}"))?;
    }

    #[cfg(not(unix))]
    {
        let _ = path;
    }

    Ok(())
}

fn slugify(value: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;

    for ch in value.chars() {
        let normalized = if ch.is_ascii_alphanumeric() {
            ch.to_ascii_lowercase()
        } else {
            '-'
        };

        if normalized == '-' {
            if !prev_dash && !out.is_empty() {
                out.push('-');
            }
            prev_dash = true;
        } else {
            out.push(normalized);
            prev_dash = false;
        }
    }

    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "game".to_string()
    } else {
        out
    }
}

fn escape_desktop_value(value: &str) -> String {
    value.replace('\n', " ")
}

fn shell_escape(value: &str) -> String {
    let escaped = value.replace('"', "\\\"");
    format!("\"{}\"", escaped)
}

fn desktop_exec_command(plan: &launch::LaunchPlan) -> String {
    let mut parts = Vec::new();
    if plan.environment.is_empty() {
        parts.push(shell_escape(&plan.xenia_executable_path));
    } else {
        parts.push(shell_escape("/usr/bin/env"));
        for (key, value) in &plan.environment {
            parts.push(shell_escape(&format!("{}={}", key, value)));
        }
        parts.push(shell_escape(&plan.xenia_executable_path));
    }
    parts.push(shell_escape(&format!("--config={}", plan.config_path)));
    parts.push(shell_escape(&plan.game_executable_path));
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_normalizes_titles() {
        assert_eq!(slugify("Halo 3"), "halo-3");
        assert_eq!(slugify("Forza Motorsport 2!"), "forza-motorsport-2");
        assert_eq!(slugify("***"), "game");
    }

    #[test]
    fn shell_escape_quotes_values() {
        assert_eq!(
            shell_escape("/path/with space/game.xex"),
            "\"/path/with space/game.xex\""
        );
    }

    #[test]
    fn desktop_exec_command_includes_env_and_config() {
        let plan = launch::LaunchPlan {
            xenia_executable_path: "/usr/bin/xenia_canary".into(),
            game_executable_path: "/games/Halo 3.iso".into(),
            config_path: "/tmp/game.toml".into(),
            environment: vec![("MANGOHUD".into(), "1".into())],
        };
        let command = desktop_exec_command(&plan);
        assert!(command.contains("/usr/bin/env"));
        assert!(command.contains("MANGOHUD=1"));
        assert!(command.contains("--config=/tmp/game.toml"));
        assert!(command.contains("/games/Halo 3.iso"));
    }
}
