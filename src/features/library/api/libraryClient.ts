/**
 * Tauri invoke bridge for library management and launch commands.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  AddSourceResult,
  BrowseLibraryPayload,
  DuplicateResolutionInput,
  DuplicateResolutionRecord,
  ContentImportResult,
  ContentRemoveResult,
  GameIdentityRecord,
  GameInstalledContent,
  LaunchPreflight,
  LaunchResult,
  LibraryGameDetails,
  LibrarySource,
  LibraryStatus,
  ManualGameInput,
  SourceCatalog,
  ReviewInboxPayload,
  UpdateGameIdentityInput,
} from "../model/libraryTypes";
import type {
  ImportPatchInput,
} from "../model/patchTypes";
import type {
  EffectiveConfig,
  MaterializedLaunchConfig,
  ProfileDocument,
  ProfileInventory,
  RecommendationAvailability,
} from "../model/profileTypes";
import type {
  BackupEntry,
  ConflictPlan,
  ConflictPolicy,
  ExportPreflight,
  ExportResult,
  ImportApplyResult,
  ImportInspection,
} from "../model/saveTypes";

export async function addLibrarySource(
  libraryMetadataPath: string,
  path: string,
): Promise<AddSourceResult> {
  return invoke<AddSourceResult>("add_library_source", {
    libraryMetadataPath,
    path,
  });
}

export async function listLibrarySources(
  libraryMetadataPath: string,
): Promise<LibrarySource[]> {
  return invoke<LibrarySource[]>("list_library_sources", {
    libraryMetadataPath,
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

export async function cancelScan(
  appDataPath: string,
  jobId: string,
): Promise<void> {
  return invoke<void>("cancel_scan", {
    appDataPath,
    jobId,
  });
}

export async function getLibraryStatus(
  libraryMetadataPath: string,
): Promise<LibraryStatus> {
  return invoke<LibraryStatus>("get_library_status", {
    libraryMetadataPath,
  });
}

export async function getSourceCatalog(
  libraryMetadataPath: string,
  sourceId: string,
): Promise<SourceCatalog> {
  return invoke<SourceCatalog>("get_source_catalog", {
    libraryMetadataPath,
    sourceId,
  });
}

export async function getAllCatalogs(
  libraryMetadataPath: string,
): Promise<SourceCatalog[]> {
  return invoke<SourceCatalog[]>("get_all_catalogs", {
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

export async function getReviewInbox(
  libraryMetadataPath: string,
): Promise<ReviewInboxPayload> {
  return invoke<ReviewInboxPayload>("get_review_inbox", {
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

export async function resolveDuplicateReview(
  libraryMetadataPath: string,
  input: DuplicateResolutionInput,
): Promise<DuplicateResolutionRecord> {
  return invoke<DuplicateResolutionRecord>("resolve_duplicate_review", {
    libraryMetadataPath,
    input,
  });
}

export async function getLaunchPreflight(
  appDataPath: string,
  libraryMetadataPath: string,
  gameId: string,
): Promise<LaunchPreflight> {
  return invoke<LaunchPreflight>("get_launch_preflight", {
    appDataPath,
    libraryMetadataPath,
    gameId,
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

export interface CommunityXeniaPatchCandidate {
  remote_key: string;
  file_name: string;
  download_url: string;
  installed_file_path: string | null;
  title_name: string | null;
  title_id: string | null;
  version: string | null;
  entry_count: number;
  update_available: boolean;
}

export interface FetchCommunityXeniaPatchResult {
  file_name: string;
  file_path: string;
  overwritten: boolean;
}

export async function getGameXeniaPatches(
  appDataPath: string,
  titleId: string,
): Promise<GameXeniaPatches> {
  return invoke<GameXeniaPatches>("get_game_xenia_patches", { appDataPath, titleId });
}

export async function listXeniaCommunityPatchCandidates(
  appDataPath: string,
  titleId: string,
): Promise<CommunityXeniaPatchCandidate[]> {
  return invoke<CommunityXeniaPatchCandidate[]>("list_xenia_community_patch_candidates", {
    appDataPath,
    titleId,
  });
}

export async function fetchXeniaCommunityPatch(
  appDataPath: string,
  remoteKey: string,
): Promise<FetchCommunityXeniaPatchResult> {
  return invoke<FetchCommunityXeniaPatchResult>("fetch_xenia_community_patch", {
    appDataPath,
    remoteKey,
  });
}

export async function importXeniaPatchFile(
  appDataPath: string,
  input: ImportPatchInput,
): Promise<void> {
  return invoke<void>("import_xenia_patch_file", { appDataPath, input });
}

export async function toggleXeniaPatchEntry(
  appDataPath: string,
  filePath: string,
  entryName: string,
  enabled: boolean,
): Promise<void> {
  return invoke<void>("toggle_xenia_patch_entry", { appDataPath, filePath, entryName, enabled });
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
// Materialization commands
// ---------------------------------------------------------------------------

export async function getMaterializedLaunchConfig(
  appDataPath: string,
  libraryMetadataPath: string,
  gameId: string,
): Promise<MaterializedLaunchConfig> {
  return invoke<MaterializedLaunchConfig>("get_materialized_launch_config", {
    appDataPath,
    libraryMetadataPath,
    gameId,
  });
}

// ---------------------------------------------------------------------------
// Recommendation commands
// ---------------------------------------------------------------------------

export async function checkRecommendationAvailability(
  gameId: string,
): Promise<RecommendationAvailability> {
  return invoke<RecommendationAvailability>(
    "check_recommendation_availability",
    { gameId },
  );
}

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
  sourceGameId: string,
  sourceGameTitle: string,
  policy: ConflictPolicy,
): Promise<ConflictPlan> {
  return invoke<ConflictPlan>("get_import_conflict_plan", {
    libraryMetadataPath,
    xeniaPath,
    stagingPath,
    targetGameId,
    sourceGameId,
    sourceGameTitle,
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

export async function listSaveBackups(
  appDataPath: string,
): Promise<BackupEntry[]> {
  return invoke<BackupEntry[]>("list_save_backups", {
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
