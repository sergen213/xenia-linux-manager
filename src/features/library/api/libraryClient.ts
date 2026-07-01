/**
 * Sidecar invoke bridge for library management and launch commands.
 */

import { invoke, listen, type UnlistenFn } from "../../../platform/bridge";
import type {
  AddSourceResult,
  BrowseLibraryPayload,
  ContentImportResult,
  ContentRemoveResult,
  GameIdentityRecord,
  GameInstalledContent,
  LaunchResult,
  LibraryGameDetails,
  LibrarySource,
  LibraryStatus,
  ManualGameInput,
  UpdateGameIdentityInput,
} from "../model/libraryTypes";
import type {
  ImportPatchInput,
} from "../model/patchTypes";
import type {
  EffectiveConfig,
  ProfileDocument,
  ProfileInventory,
} from "../model/profileTypes";
import type {
  ConflictPlan,
  ConflictPolicy,
  ExportPreflight,
  ExportResult,
  ImportApplyResult,
  ImportInspection,
} from "../model/saveTypes";

// ---------------------------------------------------------------------------
// Directory browsing (gamepad-navigable folder picker)
// ---------------------------------------------------------------------------

export interface DirEntry {
  name: string;
  path: string;
}

export interface DirListing {
  path: string;
  parent: string | null;
  entries: DirEntry[];
}

/** List immediate subdirectories of `path` (hidden skipped, sorted). Empty or
 *  invalid paths fall back to $HOME on the backend. */
export async function listDirectory(path: string): Promise<DirListing> {
  return invoke<DirListing>("list_directory", { path });
}

export async function addLibrarySource(
  libraryMetadataPath: string,
  path: string,
): Promise<AddSourceResult> {
  return invoke<AddSourceResult>("add_library_source", {
    libraryMetadataPath,
    path,
  });
}

export async function removeLibrarySource(
  libraryMetadataPath: string,
  sourceId: string,
): Promise<LibrarySource> {
  return invoke<LibrarySource>("remove_library_source", {
    libraryMetadataPath,
    sourceId,
  });
}

export async function startSourceScan(
  libraryMetadataPath: string,
  sourceId: string,
): Promise<string> {
  return invoke<string>("start_source_scan", {
    libraryMetadataPath,
    sourceId,
  });
}

export async function scanAllSources(
  libraryMetadataPath: string,
): Promise<string[]> {
  return invoke<string[]>("scan_all_sources", {
    libraryMetadataPath,
  });
}

export async function getLibraryStatus(
  libraryMetadataPath: string,
): Promise<LibraryStatus> {
  return invoke<LibraryStatus>("get_library_status", {
    libraryMetadataPath,
  });
}

export async function browseLibrary(
  libraryMetadataPath: string,
): Promise<BrowseLibraryPayload> {
  return invoke<BrowseLibraryPayload>("browse_library", {
    libraryMetadataPath,
  });
}

export async function getLibraryGameDetails(
  libraryMetadataPath: string,
  gameId: string,
): Promise<LibraryGameDetails> {
  return invoke<LibraryGameDetails>("get_library_game_details", {
    libraryMetadataPath,
    gameId,
  });
}

export async function inspectGameContent(
  appDataPath: string,
  libraryMetadataPath: string,
  gameId: string,
): Promise<GameInstalledContent> {
  return invoke<GameInstalledContent>("inspect_game_content", {
    appDataPath,
    libraryMetadataPath,
    gameId,
  });
}

export async function importGameContent(
  appDataPath: string,
  libraryMetadataPath: string,
  gameId: string,
  sourcePath: string,
  contentType: string,
): Promise<ContentImportResult> {
  return invoke<ContentImportResult>("import_game_content", {
    appDataPath,
    libraryMetadataPath,
    gameId,
    sourcePath,
    contentType,
  });
}

export async function removeGameContent(
  appDataPath: string,
  libraryMetadataPath: string,
  gameId: string,
  entryPath: string,
): Promise<ContentRemoveResult> {
  return invoke<ContentRemoveResult>("remove_game_content", {
    appDataPath,
    libraryMetadataPath,
    gameId,
    entryPath,
  });
}

export async function createManualGame(
  libraryMetadataPath: string,
  input: ManualGameInput,
): Promise<GameIdentityRecord> {
  return invoke<GameIdentityRecord>("create_manual_game", {
    libraryMetadataPath,
    input,
  });
}

export async function updateLibraryGameIdentity(
  libraryMetadataPath: string,
  input: UpdateGameIdentityInput,
): Promise<GameIdentityRecord> {
  return invoke<GameIdentityRecord>("update_library_game_identity", {
    libraryMetadataPath,
    input,
  });
}

export async function updatePreferredXeniaBuild(
  libraryMetadataPath: string,
  input: { game_id: string; preferred_xenia_tag: string | null },
): Promise<GameIdentityRecord> {
  return invoke<GameIdentityRecord>("update_preferred_xenia_build", {
    libraryMetadataPath,
    input,
  });
}

export async function updateGameLaunchEnvironment(
  libraryMetadataPath: string,
  input: { game_id: string; launch_environment: string | null },
): Promise<GameIdentityRecord> {
  return invoke<GameIdentityRecord>("update_game_launch_environment", {
    libraryMetadataPath,
    input,
  });
}

export async function updateGameLaunchWrapper(
  libraryMetadataPath: string,
  input: { game_id: string; launch_wrapper: string | null },
): Promise<GameIdentityRecord> {
  return invoke<GameIdentityRecord>("update_game_launch_wrapper", {
    libraryMetadataPath,
    input,
  });
}

export async function launchLibraryGame(
  appDataPath: string,
  libraryMetadataPath: string,
  gameId: string,
  allowWarnings = false,
): Promise<LaunchResult> {
  return invoke<LaunchResult>("launch_library_game", {
    appDataPath,
    libraryMetadataPath,
    gameId,
    allowWarnings,
  });
}

export interface GameExitedPayload {
  game_id: string;
  pid: number;
  exit_code: number | null;
}

/** Subscribe to the `game:exited` event fired when a launched game closes. */
export function onGameExited(
  callback: (payload: GameExitedPayload) => void,
): Promise<UnlistenFn> {
  return listen<GameExitedPayload>("game:exited", (event) =>
    callback(event.payload),
  );
}

export interface DesktopShortcutExportResult {
  desktop_file_path: string;
  desktop_entry_name: string;
  target: string;
  overwritten: boolean;
}

export interface DesktopShortcutLocations {
  applications_dir: string;
  desktop_dir: string;
}

export async function exportGameDesktopShortcut(
  appDataPath: string,
  libraryMetadataPath: string,
  gameId: string,
  target: "applications" | "desktop" = "applications",
): Promise<DesktopShortcutExportResult> {
  return invoke<DesktopShortcutExportResult>("export_game_desktop_shortcut", {
    appDataPath,
    libraryMetadataPath,
    gameId,
    target,
  });
}

export async function getShortcutLocations(): Promise<DesktopShortcutLocations> {
  return invoke<DesktopShortcutLocations>("get_shortcut_locations");
}

// ---------------------------------------------------------------------------
// Artwork commands
// ---------------------------------------------------------------------------

export interface ArtworkResult {
  game_id: string;
  artwork_path: string | null;
  already_cached: boolean;
  error: string | null;
}

export async function fetchGameArtwork(
  libraryMetadataPath: string,
  gameId: string,
): Promise<ArtworkResult> {
  return invoke<ArtworkResult>("fetch_game_artwork", {
    libraryMetadataPath,
    gameId,
  });
}

export async function fetchAllArtwork(
  libraryMetadataPath: string,
): Promise<ArtworkResult[]> {
  return invoke<ArtworkResult[]>("fetch_all_artwork", {
    libraryMetadataPath,
  });
}

/** Re-download every cover, ignoring the cache — upgrades old front-only art
 *  to XboxUnity's full 3D-case wraps. */
export async function refetchAllArtwork(
  libraryMetadataPath: string,
): Promise<ArtworkResult[]> {
  return invoke<ArtworkResult[]>("refetch_all_artwork", {
    libraryMetadataPath,
  });
}

export interface SynopsisResult {
  game_id: string;
  synopsis: string | null;
  error: string | null;
}

export async function fetchGameSynopsis(
  libraryMetadataPath: string,
  gameId: string,
): Promise<SynopsisResult> {
  return invoke<SynopsisResult>("fetch_game_synopsis", {
    libraryMetadataPath,
    gameId,
  });
}

export interface ScreenshotsResult {
  game_id: string;
  screenshots: string[];
  error: string | null;
}

export async function fetchGameScreenshots(
  libraryMetadataPath: string,
  gameId: string,
): Promise<ScreenshotsResult> {
  return invoke<ScreenshotsResult>("fetch_game_screenshots", {
    libraryMetadataPath,
    gameId,
  });
}

// ---------------------------------------------------------------------------
// Game patches deploy commands
// ---------------------------------------------------------------------------

export interface PatchesVersionInfo {
  local_version: string | null;
  remote_version: string | null;
  update_available: boolean;
  patches_dir: string;
  patch_count: number;
}

export interface DeployPatchesResult {
  patches_dir: string;
  patch_count: number;
  version: string | null;
  error: string | null;
}

export async function checkPatchesStatus(appDataPath: string): Promise<PatchesVersionInfo> {
  return invoke<PatchesVersionInfo>("check_patches_status", { appDataPath });
}

export async function deployGamePatches(appDataPath: string): Promise<DeployPatchesResult> {
  return invoke<DeployPatchesResult>("deploy_game_patches", { appDataPath });
}

// ---------------------------------------------------------------------------
// Xenia patch file commands (direct file I/O)
// ---------------------------------------------------------------------------

export interface XeniaPatchEntry {
  name: string;
  description: string | null;
  author: string | null;
  is_enabled: boolean;
}

export interface XeniaPatchFile {
  file_name: string;
  file_path: string;
  title_name: string | null;
  title_id: string | null;
  version: string | null;
  hashes: string[];
  entries: XeniaPatchEntry[];
}

export interface GameXeniaPatches {
  title_id: string;
  patches_dir: string;
  files: XeniaPatchFile[];
}

export async function getGameXeniaPatches(
  appDataPath: string,
  titleId: string,
): Promise<GameXeniaPatches> {
  return invoke<GameXeniaPatches>("get_game_xenia_patches", { appDataPath, titleId });
}

export async function importXeniaPatchFile(
  appDataPath: string,
  input: ImportPatchInput,
): Promise<void> {
  return invoke<void>("import_xenia_patch_file", { appDataPath, input });
}

export async function toggleXeniaPatchEntry(
  filePath: string,
  entryName: string,
  enabled: boolean,
): Promise<void> {
  return invoke<void>("toggle_xenia_patch_entry", { filePath, entryName, enabled });
}

// ---------------------------------------------------------------------------
// Profile commands
// ---------------------------------------------------------------------------

export async function listGameProfiles(
  libraryMetadataPath: string,
  gameId: string,
): Promise<ProfileInventory> {
  return invoke<ProfileInventory>("list_game_profiles", {
    libraryMetadataPath,
    gameId,
  });
}

export async function createGameProfile(
  libraryMetadataPath: string,
  gameId: string,
  name: string,
): Promise<ProfileInventory> {
  return invoke<ProfileInventory>("create_game_profile", {
    libraryMetadataPath,
    gameId,
    name,
  });
}

export async function renameGameProfile(
  libraryMetadataPath: string,
  gameId: string,
  profileId: string,
  newName: string,
): Promise<ProfileInventory> {
  return invoke<ProfileInventory>("rename_game_profile", {
    libraryMetadataPath,
    gameId,
    profileId,
    newName,
  });
}

export async function deleteGameProfile(
  libraryMetadataPath: string,
  gameId: string,
  profileId: string,
): Promise<ProfileInventory> {
  return invoke<ProfileInventory>("delete_game_profile", {
    libraryMetadataPath,
    gameId,
    profileId,
  });
}

export async function selectActiveGameProfile(
  libraryMetadataPath: string,
  gameId: string,
  profileId: string | null,
): Promise<ProfileInventory> {
  return invoke<ProfileInventory>("select_active_game_profile", {
    libraryMetadataPath,
    gameId,
    profileId,
  });
}

export async function getProfileEffectiveConfig(
  libraryMetadataPath: string,
  gameId: string,
  profileId: string,
): Promise<EffectiveConfig> {
  return invoke<EffectiveConfig>("get_profile_effective_config", {
    libraryMetadataPath,
    gameId,
    profileId,
  });
}

export async function saveProfileOverrides(
  libraryMetadataPath: string,
  gameId: string,
  profileId: string,
  overrides: Record<string, unknown>,
): Promise<ProfileDocument> {
  return invoke<ProfileDocument>("save_profile_overrides", {
    libraryMetadataPath,
    gameId,
    profileId,
    overrides,
  });
}

// ---------------------------------------------------------------------------
// Recommendation commands
// ---------------------------------------------------------------------------

export async function applyRecommendedProfile(
  libraryMetadataPath: string,
  gameId: string,
  profileName?: string,
): Promise<ProfileInventory> {
  return invoke<ProfileInventory>("apply_recommended_profile", {
    libraryMetadataPath,
    gameId,
    profileName: profileName ?? null,
  });
}

// ---------------------------------------------------------------------------
// Save commands
// ---------------------------------------------------------------------------

export async function getExportPreflight(
  libraryMetadataPath: string,
  xeniaPath: string,
  gameId: string,
): Promise<ExportPreflight> {
  return invoke<ExportPreflight>("get_export_preflight", {
    libraryMetadataPath,
    xeniaPath,
    gameId,
  });
}

export async function exportSaveArchive(
  appDataPath: string,
  libraryMetadataPath: string,
  xeniaPath: string,
  gameId: string,
  outputDir: string,
  selectedLabels?: string[],
): Promise<ExportResult> {
  return invoke<ExportResult>("export_save_archive", {
    appDataPath,
    libraryMetadataPath,
    xeniaPath,
    gameId,
    outputDir,
    selectedLabels: selectedLabels ?? null,
  });
}

export async function inspectSaveArchive(
  appDataPath: string,
  libraryMetadataPath: string,
  archivePath: string,
): Promise<ImportInspection> {
  return invoke<ImportInspection>("inspect_save_archive", {
    appDataPath,
    libraryMetadataPath,
    archivePath,
  });
}

export async function getImportConflictPlan(
  libraryMetadataPath: string,
  xeniaPath: string,
  stagingPath: string,
  targetGameId: string,
  policy: ConflictPolicy,
): Promise<ConflictPlan> {
  return invoke<ConflictPlan>("get_import_conflict_plan", {
    libraryMetadataPath,
    xeniaPath,
    stagingPath,
    targetGameId,
    policy,
  });
}

export async function applySaveImport(
  appDataPath: string,
  libraryMetadataPath: string,
  xeniaPath: string,
  plan: ConflictPlan,
  stagingPath: string,
  forceWithoutBackup = false,
): Promise<ImportApplyResult> {
  return invoke<ImportApplyResult>("apply_save_import", {
    appDataPath,
    libraryMetadataPath,
    xeniaPath,
    plan,
    stagingPath,
    forceWithoutBackup,
  });
}

export async function cleanupSaveImportStaging(
  appDataPath: string,
): Promise<void> {
  return invoke<void>("cleanup_save_import_staging", {
    appDataPath,
  });
}

// ---------------------------------------------------------------------------
// Steam export commands
// ---------------------------------------------------------------------------

export interface SteamInstallInfo {
  steam_root: string;
  user_ids: string[];
}

export interface SteamExportResult {
  game_id: string;
  game_title: string;
  steam_app_id: number;
  shortcuts_vdf_path: string;
  grid_dir: string;
  artwork_copied: string[];
  already_existed: boolean;
  error: string | null;
}

export async function detectSteamInstall(): Promise<SteamInstallInfo> {
  return invoke<SteamInstallInfo>("detect_steam_install");
}

export async function exportGameToSteam(
  libraryMetadataPath: string,
  appDataPath: string,
  gameId: string,
  steamUserId: string,
): Promise<SteamExportResult> {
  return invoke<SteamExportResult>("export_game_to_steam", {
    libraryMetadataPath,
    appDataPath,
    gameId,
    steamUserId,
  });
}

// ---------------------------------------------------------------------------
// Shell commands
// ---------------------------------------------------------------------------

/** Open a file or directory in the system's default handler (xdg-open). */
export async function openPath(
  path: string,
  allowedRoots: string[] = [path],
): Promise<void> {
  return invoke<void>("open_path", { path, allowedRoots });
}
