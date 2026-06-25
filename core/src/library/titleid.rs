//! Xbox 360 title ID extraction from game file headers.
//!
//! Parses XEX2 (Xbox Executable), GOD (Games on Demand), and STFS
//! (Signed Transactions File System) headers to extract the title ID
//! without needing to run the game.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// XEX2 file magic bytes.
const XEX2_MAGIC: &[u8; 4] = b"XEX2";

/// Optional header key for Execution ID (contains title ID).
const XEX_HEADER_EXECUTION_ID: u32 = 0x00040006;

/// GOD/STFS header magic values.
const MAGIC_CON: &[u8; 4] = b"CON ";
const MAGIC_PIRS: &[u8; 4] = b"PIRS";
const MAGIC_LIVE: &[u8; 4] = b"LIVE";

/// Offset of the title ID within GOD/STFS headers.
const STFS_TITLE_ID_OFFSET: u64 = 0x0360;

/// XISO volume descriptor offset candidates (sector 32 from partition start).
/// Xbox 360 game partitions can start at different offsets.
const XISO_PARTITION_OFFSETS: &[u64] = &[
    0,         // Raw XISO (no padding)
    0x10000,   // Some tools pad to 64KB
    0xFD90000, // Standard Xbox 360 disc layout (sector 0x1FB20 * 0x800)
];
const XDVDFS_SECTOR_SIZE: u64 = 2048;
const XDVDFS_ROOT_DIR_SECTOR_OFFSET: u64 = 32; // Volume descriptor at sector 32

/// Extract the title ID from any supported Xbox 360 game file.
///
/// Tries XEX, GOD/STFS, and XISO parsing in order based on file extension.
/// Returns the title ID as an 8-character uppercase hex string.
pub fn extract_title_id(path: &Path) -> Option<String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "xex" => extract_from_xex(path),
        "god" => extract_from_stfs(path),
        "iso" | "xiso" => extract_from_xiso(path),
        _ => {
            // Try XEX first, then STFS, then XISO
            extract_from_xex(path)
                .or_else(|| extract_from_stfs(path))
                .or_else(|| extract_from_xiso(path))
        }
    }
}

/// Extract title ID from an XEX2 file by parsing the Execution ID optional header.
fn extract_from_xex(path: &Path) -> Option<String> {
    extract_xex_title_id_at_offset(&mut File::open(path).ok()?, 0)
}

/// Extract title ID from a GOD or STFS container.
///
/// Both formats store the title ID at offset 0x0360 in the header.
fn extract_from_stfs(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;

    // Verify magic (CON, PIRS, or LIVE).
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic).ok()?;
    if &magic != MAGIC_CON && &magic != MAGIC_PIRS && &magic != MAGIC_LIVE {
        return None;
    }

    // Read title ID at fixed offset.
    file.seek(SeekFrom::Start(STFS_TITLE_ID_OFFSET)).ok()?;
    let mut buf4 = [0u8; 4];
    file.read_exact(&mut buf4).ok()?;
    let title_id = u32::from_be_bytes(buf4);

    if title_id != 0 {
        Some(format!("{:08X}", title_id))
    } else {
        None
    }
}

/// Extract title ID from an XISO/ISO file by locating the root directory
/// and finding the default.xex entry, then parsing its XEX header in-place.
fn extract_from_xiso(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let file_size = file.metadata().ok()?.len();

    for &partition_offset in XISO_PARTITION_OFFSETS {
        if partition_offset >= file_size {
            continue;
        }

        // Volume descriptor is at sector 32 from partition start.
        let vol_desc_offset = partition_offset + XDVDFS_ROOT_DIR_SECTOR_OFFSET * XDVDFS_SECTOR_SIZE;
        if vol_desc_offset + 20 >= file_size {
            continue;
        }

        // Read XDVDFS volume descriptor: check for "MICROSOFT*XBOX*MEDIA" magic.
        if file.seek(SeekFrom::Start(vol_desc_offset)).is_err() {
            continue;
        }
        let mut vol_magic = [0u8; 20];
        if file.read_exact(&mut vol_magic).is_err() {
            continue;
        }
        if &vol_magic != b"MICROSOFT*XBOX*MEDIA" {
            continue;
        }

        // Read root directory table sector and size from volume descriptor.
        // At offset 20: root_dir_sector (4 bytes LE), root_dir_size (4 bytes LE).
        let mut root_info = [0u8; 8];
        if file.read_exact(&mut root_info).is_err() {
            continue;
        }
        let root_sector =
            u32::from_le_bytes([root_info[0], root_info[1], root_info[2], root_info[3]]);
        let root_size =
            u32::from_le_bytes([root_info[4], root_info[5], root_info[6], root_info[7]]);

        if root_size == 0 || root_size > 1024 * 1024 {
            continue;
        }

        // Read root directory table.
        let root_offset = partition_offset + (root_sector as u64) * XDVDFS_SECTOR_SIZE;
        if root_offset + root_size as u64 > file_size {
            continue;
        }
        if file.seek(SeekFrom::Start(root_offset)).is_err() {
            continue;
        }
        let mut dir_data = vec![0u8; root_size as usize];
        if file.read_exact(&mut dir_data).is_err() {
            continue;
        }

        // Search directory entries for default.xex.
        if let Some(title_id) =
            find_xex_in_directory(&mut file, &dir_data, partition_offset, file_size)
        {
            return Some(title_id);
        }
    }

    None
}

/// Search an XDVDFS directory table for default.xex and extract its title ID.
///
/// Directory entry format (all little-endian):
///   0x00: left subtree offset (2 bytes) - relative to directory start, *4
///   0x02: right subtree offset (2 bytes) - relative to directory start, *4
///   0x04: file start sector (4 bytes)
///   0x08: file size (4 bytes)
///   0x0C: attributes (1 byte)
///   0x0D: filename length (1 byte)
///   0x0E: filename (variable length)
fn find_xex_in_directory(
    file: &mut File,
    dir_data: &[u8],
    partition_offset: u64,
    file_size: u64,
) -> Option<String> {
    let mut stack = vec![0usize]; // Start at offset 0

    while let Some(entry_offset) = stack.pop() {
        if entry_offset + 14 > dir_data.len() {
            continue;
        }

        let left =
            u16::from_le_bytes([dir_data[entry_offset], dir_data[entry_offset + 1]]) as usize * 4;
        let right = u16::from_le_bytes([dir_data[entry_offset + 2], dir_data[entry_offset + 3]])
            as usize
            * 4;
        let sector = u32::from_le_bytes([
            dir_data[entry_offset + 4],
            dir_data[entry_offset + 5],
            dir_data[entry_offset + 6],
            dir_data[entry_offset + 7],
        ]);
        let _entry_file_size = u32::from_le_bytes([
            dir_data[entry_offset + 8],
            dir_data[entry_offset + 9],
            dir_data[entry_offset + 10],
            dir_data[entry_offset + 11],
        ]);
        let _attributes = dir_data[entry_offset + 12];
        let name_len = dir_data[entry_offset + 13] as usize;

        if entry_offset + 14 + name_len > dir_data.len() {
            continue;
        }

        let name = std::str::from_utf8(&dir_data[entry_offset + 14..entry_offset + 14 + name_len])
            .unwrap_or("");

        if name.eq_ignore_ascii_case("default.xex") {
            // Found it! Read the XEX header from this sector.
            let xex_offset = partition_offset + (sector as u64) * XDVDFS_SECTOR_SIZE;
            if xex_offset < file_size {
                return extract_xex_title_id_at_offset(file, xex_offset);
            }
        }

        // Traverse subtrees.
        if left != 0 && left != entry_offset {
            stack.push(left);
        }
        if right != 0 && right != entry_offset {
            stack.push(right);
        }
    }

    None
}

/// Parse an XEX2 header at a given offset within a file (for ISOs).
fn extract_xex_title_id_at_offset(file: &mut File, base_offset: u64) -> Option<String> {
    file.seek(SeekFrom::Start(base_offset)).ok()?;

    let mut magic = [0u8; 4];
    file.read_exact(&mut magic).ok()?;
    if &magic != XEX2_MAGIC {
        return None;
    }

    // Read optional header count at base + 0x14.
    file.seek(SeekFrom::Start(base_offset + 0x14)).ok()?;
    let mut buf4 = [0u8; 4];
    file.read_exact(&mut buf4).ok()?;
    let header_count = u32::from_be_bytes(buf4);

    if header_count > 1000 {
        return None;
    }

    for i in 0..header_count {
        let offset = base_offset + 0x18 + (i as u64) * 8;
        file.seek(SeekFrom::Start(offset)).ok()?;

        let mut key_buf = [0u8; 4];
        file.read_exact(&mut key_buf).ok()?;
        let key = u32::from_be_bytes(key_buf);

        let mut val_buf = [0u8; 4];
        file.read_exact(&mut val_buf).ok()?;
        let value = u32::from_be_bytes(val_buf);

        if key == XEX_HEADER_EXECUTION_ID {
            // For embedded XEX in ISO, the offset in the header is relative
            // to the XEX file start.
            let title_id_offset = base_offset + value as u64 + 12;
            file.seek(SeekFrom::Start(title_id_offset)).ok()?;

            let mut tid_buf = [0u8; 4];
            file.read_exact(&mut tid_buf).ok()?;
            let title_id = u32::from_be_bytes(tid_buf);

            if title_id != 0 {
                return Some(format!("{:08X}", title_id));
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Build a minimal valid XEX2 file with a known title ID.
    fn build_test_xex(title_id: u32) -> Vec<u8> {
        let mut data = Vec::new();

        // Magic: XEX2
        data.extend_from_slice(b"XEX2");
        // Module flags (4 bytes)
        data.extend_from_slice(&[0u8; 4]);
        // Header size (4 bytes) - doesn't matter for this test
        data.extend_from_slice(&0x1000u32.to_be_bytes());
        // Reserved (4 bytes)
        data.extend_from_slice(&[0u8; 4]);
        // Security info offset (4 bytes)
        data.extend_from_slice(&[0u8; 4]);
        // Optional header count: 1 (at offset 0x14)
        data.extend_from_slice(&1u32.to_be_bytes());

        // Optional header entry at 0x18:
        // Key = 0x00040006 (Execution ID)
        data.extend_from_slice(&XEX_HEADER_EXECUTION_ID.to_be_bytes());
        // Value = offset to Execution ID struct. Let's put it at 0x30.
        data.extend_from_slice(&0x30u32.to_be_bytes());

        // Pad to offset 0x30
        while data.len() < 0x30 {
            data.push(0);
        }

        // Execution ID struct at 0x30:
        // Media ID (4 bytes)
        data.extend_from_slice(&[0u8; 4]);
        // Version (4 bytes)
        data.extend_from_slice(&[0u8; 4]);
        // Base Version (4 bytes)
        data.extend_from_slice(&[0u8; 4]);
        // Title ID (4 bytes) at offset 0x3C
        data.extend_from_slice(&title_id.to_be_bytes());
        // Platform, exec type, disc num, disc count (4 bytes)
        data.extend_from_slice(&[0u8; 4]);
        // Savegame ID (4 bytes)
        data.extend_from_slice(&[0u8; 4]);

        data
    }

    /// Build a minimal STFS/GOD header with a known title ID.
    fn build_test_stfs(title_id: u32) -> Vec<u8> {
        let mut data = vec![0u8; 0x0400];
        // Magic: LIVE
        data[0..4].copy_from_slice(MAGIC_LIVE);
        // Title ID at 0x0360
        data[0x0360..0x0364].copy_from_slice(&title_id.to_be_bytes());
        data
    }

    fn write_temp_file(name: &str, data: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("xlm-titleid-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        let mut f = File::create(&path).unwrap();
        f.write_all(data).unwrap();
        path
    }

    #[test]
    fn extracts_title_id_from_xex() {
        let xex_data = build_test_xex(0x4D5307E6);
        let path = write_temp_file("test_halo3.xex", &xex_data);
        let result = extract_title_id(&path);
        assert_eq!(result, Some("4D5307E6".to_string()));
    }

    #[test]
    fn extracts_title_id_from_stfs() {
        let stfs_data = build_test_stfs(0x584108A9);
        let path = write_temp_file("test_game.god", &stfs_data);
        let result = extract_title_id(&path);
        assert_eq!(result, Some("584108A9".to_string()));
    }

    #[test]
    fn returns_none_for_unknown_format() {
        let path = write_temp_file("test_unknown.bin", b"not a game file");
        let result = extract_title_id(&path);
        assert_eq!(result, None);
    }

    #[test]
    fn returns_none_for_zero_title_id() {
        let xex_data = build_test_xex(0x00000000);
        let path = write_temp_file("test_zero.xex", &xex_data);
        let result = extract_title_id(&path);
        assert_eq!(result, None);
    }

    #[test]
    fn rejects_invalid_xex_magic() {
        let mut xex_data = build_test_xex(0x4D5307E6);
        xex_data[0..4].copy_from_slice(b"NOPE");
        let path = write_temp_file("test_bad_magic.xex", &xex_data);
        let result = extract_from_xex(&path);
        assert_eq!(result, None);
    }

    #[test]
    fn rejects_invalid_stfs_magic() {
        let mut stfs_data = build_test_stfs(0x584108A9);
        stfs_data[0..4].copy_from_slice(b"NOPE");
        let path = write_temp_file("test_bad_stfs.god", &stfs_data);
        let result = extract_from_stfs(&path);
        assert_eq!(result, None);
    }

    #[test]
    fn accepts_con_magic() {
        let mut data = build_test_stfs(0x11223344);
        data[0..4].copy_from_slice(MAGIC_CON);
        let path = write_temp_file("test_con.god", &data);
        let result = extract_from_stfs(&path);
        assert_eq!(result, Some("11223344".to_string()));
    }

    #[test]
    fn accepts_pirs_magic() {
        let mut data = build_test_stfs(0x55667788);
        data[0..4].copy_from_slice(MAGIC_PIRS);
        let path = write_temp_file("test_pirs.god", &data);
        let result = extract_from_stfs(&path);
        assert_eq!(result, Some("55667788".to_string()));
    }
}
