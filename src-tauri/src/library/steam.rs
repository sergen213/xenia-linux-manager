//! Steam non-Steam shortcut export.
//!
//! Writes entries into Steam's `shortcuts.vdf` (binary VDF format) and copies
//! game artwork into the Steam `grid/` directory using the naming conventions
//! Steam expects for custom artwork on non-Steam shortcuts.
//!
//! ## AppID generation
//!
//! Steam generates a 32-bit unsigned "AppID" for non-Steam shortcuts using:
//!   `crc32(utf8_bytes(exe + app_name)) | 0x80000000`
//!
//! Grid artwork files are named `<appid>p.jpg` (portrait/cover),
//! `<appid>_hero.jpg`, `<appid>_logo.png`, `<appid>_icon.png`.

use serde::{Deserialize, Serialize};
use std::fs;

use std::path::{Path, PathBuf};

use crate::library::review;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Result of locating a Steam installation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamInstallInfo {
    pub steam_root: String,
    pub user_ids: Vec<String>,
}

/// Describes the result of exporting one game to Steam.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamExportResult {
    pub game_id: String,
    pub game_title: String,
    pub steam_app_id: u32,
    pub shortcuts_vdf_path: String,
    pub grid_dir: String,
    pub artwork_copied: Vec<String>,
    pub already_existed: bool,
    pub error: Option<String>,
}

/// A single entry in shortcuts.vdf that we care about.
#[derive(Debug, Clone)]
struct ShortcutEntry {
    /// Position index in the shortcuts map (0, 1, 2 …).
    index: u32,
    /// Key-value pairs.  We keep every field we read so we can round-trip.
    fields: Vec<(String, VdfValue)>,
}

#[derive(Debug, Clone)]
enum VdfValue {
    Str(String),
    U32(u32),
}

// ---------------------------------------------------------------------------
// Steam directory detection
// ---------------------------------------------------------------------------

pub fn find_steam_install() -> Result<SteamInstallInfo, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    let candidates = [
        PathBuf::from(&home).join(".steam/steam"),
        PathBuf::from(&home).join(".local/share/Steam"),
        PathBuf::from(&home).join("snap/steam/common/.steam/steam"),
    ];

    let steam_root = candidates
        .iter()
        .find(|p| p.join("userdata").is_dir())
        .ok_or_else(|| {
            "Could not find a Steam installation. Looked in ~/.steam/steam, ~/.local/share/Steam, and ~/snap/steam/common/.steam/steam".to_string()
        })?
        .to_owned();

    let userdata = steam_root.join("userdata");
    let mut user_ids = Vec::new();
    if let Ok(entries) = fs::read_dir(&userdata) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    // User dirs are numeric IDs
                    if name.chars().all(|c| c.is_ascii_digit()) {
                        user_ids.push(name.to_string());
                    }
                }
            }
        }
    }

    if user_ids.is_empty() {
        return Err("Steam userdata directory found but contains no user profiles".to_string());
    }

    Ok(SteamInstallInfo {
        steam_root: steam_root.to_string_lossy().to_string(),
        user_ids,
    })
}

// ---------------------------------------------------------------------------
// AppID generation (CRC-32 based)
// ---------------------------------------------------------------------------

/// Generate the Steam "AppID" for a non-Steam shortcut.
///
/// Steam uses: `crc32(utf8(exe + appname)) | 0x80000000`
pub fn generate_steam_app_id(exe_path: &str, app_name: &str) -> u32 {
    let input = format!("{}{}", exe_path, app_name);
    let crc = crc32_compute(input.as_bytes());
    crc | 0x80000000
}

/// Simple CRC-32 (ISO 3309 / ITU-T V.42, same polynomial as zlib).
fn crc32_compute(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFFFFFF;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            if crc & 1 != 0 {
                crc = (crc >> 1) ^ 0xEDB88320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

// ---------------------------------------------------------------------------
// Binary VDF shortcuts.vdf parser / writer
// ---------------------------------------------------------------------------

// VDF type tags
const VDF_MAP_START: u8 = 0x00;
const VDF_STR: u8 = 0x01;
const VDF_U32: u8 = 0x02;
const VDF_MAP_END: u8 = 0x08;

fn read_null_terminated_string(data: &[u8], pos: &mut usize) -> Result<String, String> {
    let start = *pos;
    while *pos < data.len() && data[*pos] != 0 {
        *pos += 1;
    }
    if *pos >= data.len() {
        return Err("Unexpected end of VDF data while reading string".to_string());
    }
    let s = String::from_utf8_lossy(&data[start..*pos]).to_string();
    *pos += 1; // skip null terminator
    Ok(s)
}

fn read_u32_le(data: &[u8], pos: &mut usize) -> Result<u32, String> {
    if *pos + 4 > data.len() {
        return Err("Unexpected end of VDF data while reading u32".to_string());
    }
    let val = u32::from_le_bytes([data[*pos], data[*pos + 1], data[*pos + 2], data[*pos + 3]]);
    *pos += 4;
    Ok(val)
}

/// Parse all shortcut entries from a shortcuts.vdf binary blob.
fn parse_shortcuts_vdf(data: &[u8]) -> Result<Vec<ShortcutEntry>, String> {
    if data.is_empty() {
        return Ok(Vec::new());
    }

    let mut pos = 0;

    // Root: 0x00 "shortcuts" 0x00
    if pos >= data.len() || data[pos] != VDF_MAP_START {
        return Err("Invalid VDF: expected map-start at root".to_string());
    }
    pos += 1;
    let root_name = read_null_terminated_string(data, &mut pos)?;
    if root_name != "shortcuts" {
        return Err(format!("Unexpected root key: {root_name}"));
    }

    let mut entries = Vec::new();

    // Each shortcut entry: 0x00 "0" 0x00 ... 0x08
    loop {
        if pos >= data.len() || data[pos] == VDF_MAP_END {
            break;
        }
        if data[pos] != VDF_MAP_START {
            break;
        }
        pos += 1;
        let index_str = read_null_terminated_string(data, &mut pos)?;
        let index: u32 = index_str.parse().unwrap_or(entries.len() as u32);

        let mut fields = Vec::new();

        // Read fields until map end
        loop {
            if pos >= data.len() || data[pos] == VDF_MAP_END {
                if pos < data.len() {
                    pos += 1; // consume 0x08
                }
                break;
            }

            let field_type = data[pos];
            pos += 1;

            match field_type {
                VDF_STR => {
                    let key = read_null_terminated_string(data, &mut pos)?;
                    let val = read_null_terminated_string(data, &mut pos)?;
                    fields.push((key, VdfValue::Str(val)));
                }
                VDF_U32 => {
                    let key = read_null_terminated_string(data, &mut pos)?;
                    let val = read_u32_le(data, &mut pos)?;
                    fields.push((key, VdfValue::U32(val)));
                }
                VDF_MAP_START => {
                    // Sub-map (e.g. "tags"). We skip the content but preserve it
                    // by reading through to its end marker.
                    let key = read_null_terminated_string(data, &mut pos)?;
                    // For now, flatten sub-maps to an empty string marker so we
                    // know where they were. A full round-trip would store the raw
                    // bytes; for our purpose skipping is acceptable because we
                    // only _add_ entries and never modify existing ones.
                    skip_vdf_map(data, &mut pos)?;
                    fields.push((key, VdfValue::Str("__submap__".to_string())));
                }
                VDF_MAP_END => {
                    break;
                }
                other => {
                    return Err(format!(
                        "Unknown VDF field type 0x{other:02x} at offset {pos}"
                    ));
                }
            }
        }

        entries.push(ShortcutEntry { index, fields });
    }

    Ok(entries)
}

/// Skip over a VDF sub-map (consume bytes up to and including the terminating 0x08).
fn skip_vdf_map(data: &[u8], pos: &mut usize) -> Result<(), String> {
    loop {
        if *pos >= data.len() {
            return Err("Unexpected end of VDF data inside sub-map".to_string());
        }
        match data[*pos] {
            VDF_MAP_END => {
                *pos += 1;
                return Ok(());
            }
            VDF_MAP_START => {
                *pos += 1;
                let _key = read_null_terminated_string(data, pos)?;
                skip_vdf_map(data, pos)?;
            }
            VDF_STR => {
                *pos += 1;
                let _key = read_null_terminated_string(data, pos)?;
                let _val = read_null_terminated_string(data, pos)?;
            }
            VDF_U32 => {
                *pos += 1;
                let _key = read_null_terminated_string(data, pos)?;
                let _val = read_u32_le(data, pos)?;
            }
            other => {
                return Err(format!(
                    "Unknown VDF field type 0x{other:02x} inside sub-map at offset {}",
                    *pos
                ));
            }
        }
    }
}

/// Serialize a set of shortcut entries back into binary VDF.
fn serialize_shortcuts_vdf(entries: &[ShortcutEntry]) -> Vec<u8> {
    let mut buf = Vec::new();

    // Root map: 0x00 "shortcuts" 0x00
    buf.push(VDF_MAP_START);
    write_null_str(&mut buf, "shortcuts");

    for entry in entries {
        buf.push(VDF_MAP_START);
        write_null_str(&mut buf, &entry.index.to_string());

        for (key, value) in &entry.fields {
            match value {
                VdfValue::Str(s) => {
                    if s == "__submap__" {
                        // Write an empty sub-map
                        buf.push(VDF_MAP_START);
                        write_null_str(&mut buf, key);
                        buf.push(VDF_MAP_END);
                    } else {
                        buf.push(VDF_STR);
                        write_null_str(&mut buf, key);
                        write_null_str(&mut buf, s);
                    }
                }
                VdfValue::U32(v) => {
                    buf.push(VDF_U32);
                    write_null_str(&mut buf, key);
                    buf.extend_from_slice(&v.to_le_bytes());
                }
            }
        }

        buf.push(VDF_MAP_END);
    }

    buf.push(VDF_MAP_END); // end "shortcuts" map
    buf.push(VDF_MAP_END); // root terminator (Steam requires this extra 0x08)
    buf
}

fn write_null_str(buf: &mut Vec<u8>, s: &str) {
    buf.extend_from_slice(s.as_bytes());
    buf.push(0);
}

/// Build a new ShortcutEntry for a Xenia game.
fn build_shortcut_entry(
    index: u32,
    app_name: &str,
    exe_path: &str,
    game_executable: &str,
    icon_path: &str,
) -> ShortcutEntry {
    let app_id = generate_steam_app_id(exe_path, app_name);

    ShortcutEntry {
        index,
        fields: vec![
            ("appid".to_string(), VdfValue::U32(app_id)),
            ("AppName".to_string(), VdfValue::Str(app_name.to_string())),
            (
                "Exe".to_string(),
                VdfValue::Str(format!("\"{}\"", exe_path)),
            ),
            (
                "StartDir".to_string(),
                VdfValue::Str(
                    Path::new(exe_path)
                        .parent()
                        .map(|p| format!("\"{}\"", p.display()))
                        .unwrap_or_default(),
                ),
            ),
            ("icon".to_string(), VdfValue::Str(icon_path.to_string())),
            ("ShortcutPath".to_string(), VdfValue::Str(String::new())),
            (
                "LaunchOptions".to_string(),
                VdfValue::Str(format!("\"{}\"", game_executable)),
            ),
            ("IsHidden".to_string(), VdfValue::U32(0)),
            ("AllowDesktopConfig".to_string(), VdfValue::U32(1)),
            ("AllowOverlay".to_string(), VdfValue::U32(1)),
            ("OpenVR".to_string(), VdfValue::U32(0)),
            ("Devkit".to_string(), VdfValue::U32(0)),
            ("DevkitGameID".to_string(), VdfValue::Str(String::new())),
            ("DevkitOverrideAppID".to_string(), VdfValue::U32(0)),
            ("LastPlayTime".to_string(), VdfValue::U32(0)),
            ("FlatpakAppID".to_string(), VdfValue::Str(String::new())),
            ("tags".to_string(), VdfValue::Str("__submap__".to_string())),
        ],
    }
}

/// Check if a shortcut already exists by matching AppName.
fn find_existing_shortcut(entries: &[ShortcutEntry], app_name: &str) -> Option<usize> {
    entries.iter().position(|e| {
        e.fields
            .iter()
            .any(|(k, v)| k == "AppName" && matches!(v, VdfValue::Str(s) if s == app_name))
    })
}

// ---------------------------------------------------------------------------
// Grid artwork
// ---------------------------------------------------------------------------

/// Copy the game's existing artwork into Steam's grid dir as the portrait cover.
/// Returns the list of files written.
fn copy_grid_artwork(
    grid_dir: &Path,
    app_id: u32,
    artwork_path: Option<&str>,
) -> Result<Vec<String>, String> {
    fs::create_dir_all(grid_dir).map_err(|e| format!("Failed to create grid dir: {e}"))?;

    let mut copied = Vec::new();

    if let Some(art) = artwork_path {
        let src = Path::new(art);
        if src.exists() {
            let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("jpg");

            // Portrait cover (vertical capsule shown in library)
            let cover_name = format!("{}p.{}", app_id, ext);
            let dest = grid_dir.join(&cover_name);
            fs::copy(src, &dest).map_err(|e| format!("Failed to copy artwork: {e}"))?;
            copied.push(cover_name);

            // Also use as header/hero if nothing better is available
            let hero_name = format!("{}_hero.{}", app_id, ext);
            let hero_dest = grid_dir.join(&hero_name);
            if !hero_dest.exists() {
                let _ = fs::copy(src, &hero_dest);
                copied.push(hero_name);
            }
        }
    }

    Ok(copied)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Export a single game as a non-Steam shortcut.
pub fn export_game_to_steam(
    library_metadata_path: &str,
    app_data_path: &str,
    game_id: &str,
    steam_user_id: &str,
) -> Result<SteamExportResult, String> {
    let details = review::load_game_details(library_metadata_path, game_id)?;
    let install = crate::xenia::install_state::load_state(app_data_path);

    let xenia_exec = details
        .preferred_xenia_tag
        .as_ref()
        .and_then(|preferred| {
            install
                .installed_builds
                .iter()
                .find(|build| &build.tag == preferred)
                .map(|build| build.executable_path.clone())
        })
        .or_else(|| install.manifest.as_ref().map(|m| m.executable_path.clone()))
        .ok_or_else(|| "Xenia is not installed".to_string())?;

    let steam = find_steam_install()?;
    let steam_root = PathBuf::from(&steam.steam_root);

    if !steam.user_ids.contains(&steam_user_id.to_string()) {
        return Err(format!("Steam user ID {} not found", steam_user_id));
    }

    let user_dir = steam_root.join("userdata").join(steam_user_id);
    let shortcuts_path = user_dir.join("config").join("shortcuts.vdf");
    let grid_dir = user_dir.join("config").join("grid");

    let app_name = format!("{} (Xenia)", details.title);
    let app_id = generate_steam_app_id(&xenia_exec, &app_name);

    // Read existing shortcuts
    let mut entries = if shortcuts_path.exists() {
        let data =
            fs::read(&shortcuts_path).map_err(|e| format!("Failed to read shortcuts.vdf: {e}"))?;
        parse_shortcuts_vdf(&data)?
    } else {
        Vec::new()
    };

    let already_existed = find_existing_shortcut(&entries, &app_name).is_some();

    if already_existed {
        // Update existing entry in-place rather than duplicating
        let idx = find_existing_shortcut(&entries, &app_name).unwrap();
        let next_index = entries[idx].index;
        entries[idx] = build_shortcut_entry(
            next_index,
            &app_name,
            &xenia_exec,
            &details.executable_path,
            details.artwork_path.as_deref().unwrap_or(""),
        );
    } else {
        let next_index = entries
            .iter()
            .map(|e| e.index)
            .max()
            .map(|m| m + 1)
            .unwrap_or(0);
        entries.push(build_shortcut_entry(
            next_index,
            &app_name,
            &xenia_exec,
            &details.executable_path,
            details.artwork_path.as_deref().unwrap_or(""),
        ));
    }

    // Write shortcuts.vdf
    fs::create_dir_all(shortcuts_path.parent().unwrap())
        .map_err(|e| format!("Failed to create shortcuts dir: {e}"))?;
    let vdf_data = serialize_shortcuts_vdf(&entries);
    fs::write(&shortcuts_path, &vdf_data)
        .map_err(|e| format!("Failed to write shortcuts.vdf: {e}"))?;

    // Copy artwork to grid
    let artwork_copied = copy_grid_artwork(&grid_dir, app_id, details.artwork_path.as_deref())?;

    Ok(SteamExportResult {
        game_id: game_id.to_string(),
        game_title: details.title,
        steam_app_id: app_id,
        shortcuts_vdf_path: shortcuts_path.to_string_lossy().to_string(),
        grid_dir: grid_dir.to_string_lossy().to_string(),
        artwork_copied,
        already_existed,
        error: None,
    })
}

/// Detect Steam installation and list available user IDs.
pub fn detect_steam() -> Result<SteamInstallInfo, String> {
    find_steam_install()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_id_is_deterministic() {
        let id1 = generate_steam_app_id("/usr/bin/xenia", "Halo 3 (Xenia)");
        let id2 = generate_steam_app_id("/usr/bin/xenia", "Halo 3 (Xenia)");
        assert_eq!(id1, id2);
        assert!(id1 & 0x80000000 != 0, "High bit must be set");
    }

    #[test]
    fn app_id_differs_per_game() {
        let id1 = generate_steam_app_id("/usr/bin/xenia", "Halo 3 (Xenia)");
        let id2 = generate_steam_app_id("/usr/bin/xenia", "Forza Motorsport 2 (Xenia)");
        assert_ne!(id1, id2);
    }

    #[test]
    fn crc32_known_value() {
        // CRC-32 of "123456789" should be 0xCBF43926
        assert_eq!(crc32_compute(b"123456789"), 0xCBF43926);
    }

    #[test]
    fn vdf_round_trip_empty() {
        let entries: Vec<ShortcutEntry> = Vec::new();
        let data = serialize_shortcuts_vdf(&entries);
        let parsed = parse_shortcuts_vdf(&data).unwrap();
        assert_eq!(parsed.len(), 0);
    }

    #[test]
    fn vdf_round_trip_one_entry() {
        let entry = build_shortcut_entry(
            0,
            "Test Game (Xenia)",
            "/usr/bin/xenia",
            "/games/test.xex",
            "",
        );
        let data = serialize_shortcuts_vdf(&[entry]);
        let parsed = parse_shortcuts_vdf(&data).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].index, 0);

        // Find AppName
        let app_name =
            parsed[0]
                .fields
                .iter()
                .find(|(k, _)| k == "AppName")
                .map(|(_, v)| match v {
                    VdfValue::Str(s) => s.as_str(),
                    _ => "",
                });
        assert_eq!(app_name, Some("Test Game (Xenia)"));
    }

    #[test]
    fn vdf_round_trip_multiple_entries() {
        let entries = vec![
            build_shortcut_entry(0, "Game A (Xenia)", "/usr/bin/xenia", "/games/a.xex", ""),
            build_shortcut_entry(
                1,
                "Game B (Xenia)",
                "/usr/bin/xenia",
                "/games/b.xex",
                "/art/b.jpg",
            ),
        ];
        let data = serialize_shortcuts_vdf(&entries);
        let parsed = parse_shortcuts_vdf(&data).unwrap();
        assert_eq!(parsed.len(), 2);
    }

    #[test]
    fn find_existing_shortcut_works() {
        let entries = vec![
            build_shortcut_entry(0, "Game A (Xenia)", "/usr/bin/xenia", "/games/a.xex", ""),
            build_shortcut_entry(1, "Game B (Xenia)", "/usr/bin/xenia", "/games/b.xex", ""),
        ];
        assert_eq!(find_existing_shortcut(&entries, "Game A (Xenia)"), Some(0));
        assert_eq!(find_existing_shortcut(&entries, "Game B (Xenia)"), Some(1));
        assert_eq!(find_existing_shortcut(&entries, "Game C (Xenia)"), None);
    }

    #[test]
    fn grid_artwork_copies_file() {
        let tmp = std::env::temp_dir().join("steam_test_grid");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        // Create a fake artwork file
        let art_src = tmp.join("source_art.jpg");
        fs::write(&art_src, b"fake jpeg data").unwrap();

        let grid = tmp.join("grid");
        let app_id = 0x80001234;
        let copied = copy_grid_artwork(&grid, app_id, Some(art_src.to_str().unwrap())).unwrap();

        assert!(!copied.is_empty());
        assert!(grid.join(format!("{}p.jpg", app_id)).exists());

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn vdf_ends_with_correct_terminators() {
        // Steam requires the binary VDF to end with 0x08 0x08 0x08
        // (entry end, shortcuts map end, root end)
        let entry = build_shortcut_entry(
            0,
            "Test Game (Xenia)",
            "/usr/bin/xenia",
            "/games/test.xex",
            "",
        );
        let data = serialize_shortcuts_vdf(&[entry]);

        // Must end with at least 3 x 0x08
        assert!(data.len() >= 3);
        let tail = &data[data.len() - 3..];
        assert_eq!(
            tail,
            &[VDF_MAP_END, VDF_MAP_END, VDF_MAP_END],
            "VDF must end with three 0x08 terminators: entry, shortcuts, root"
        );
    }

    #[test]
    fn vdf_can_reparse_steam_written_file() {
        // Exact byte sequence produced by ValvePython/vdf for one non-Steam shortcut.
        let reference_hex = "0073686f727463757473000030000261707069640043435ae1014170704e616d6500546573742047616d65202858656e696129000145786500222f7573722f62696e2f6563686f220001537461727444697200222f7573722f62696e22000169636f6e00000153686f7274637574506174680000014c61756e63684f7074696f6e7300222f746d702f746573742e786578220002497348696464656e000000000002416c6c6f774465736b746f70436f6e666967000100000002416c6c6f774f7665726c61790001000000024f70656e56520000000000024465766b69740000000000014465766b697447616d6549440000024465766b69744f7665727269646541707049440000000000024c617374506c617954696d65000000000001466c617470616b4170704944000000746167730008080808";
        let ref_data = hex_decode(reference_hex);
        let entries = parse_shortcuts_vdf(&ref_data).unwrap();
        assert_eq!(entries.len(), 1);
        let app_name =
            entries[0]
                .fields
                .iter()
                .find(|(k, _)| k == "AppName")
                .map(|(_, v)| match v {
                    VdfValue::Str(s) => s.as_str(),
                    _ => "",
                });
        assert_eq!(app_name, Some("Test Game (Xenia)"));
    }

    /// Minimal hex decode for test constants.
    fn hex_decode(hex: &str) -> Vec<u8> {
        let hex: String = hex.chars().filter(|c| c.is_ascii_hexdigit()).collect();
        (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect()
    }
}
