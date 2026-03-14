/**
 * Tauri invoke bridge for library management and launch commands.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  AddSourceResult,
  BrowseLibraryPayload,
  DuplicateResolutionInput,
  DuplicateResolutionRecord,
  GameIdentityRecord,
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
  FetchRemotePatchResult,
  GamePatchInventory,
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

export async function listGamePatches(
  libraryMetadataPath: string,
  gameId: string,
): Promise<GamePatchInventory> {
  return invoke<GamePatchInventory>("list_game_patches", {
    libraryMetadataPath,
    gameId,
  });
}

export async function importGamePatch(
  libraryMetadataPath: string,
  gameId: string,
  input: ImportPatchInput,
): Promise<GamePatchInventory> {
  return invoke<GamePatchInventory>("import_game_patch", {
    libraryMetadataPath,
    gameId,
    input,
  });
}

export async function fetchGamePatch(
  libraryMetadataPath: string,
  gameId: string,
  confirmReplace = false,
): Promise<FetchRemotePatchResult> {
  return invoke<FetchRemotePatchResult>("fetch_game_patch", {
    libraryMetadataPath,
    gameId,
    confirmReplace,
  });
}

export async function selectActivePatchFile(
  libraryMetadataPath: string,
  gameId: string,
  patchFileId: string | null,
): Promise<GamePatchInventory> {
  return invoke<GamePatchInventory>("select_active_patch_file", {
    libraryMetadataPath,
    gameId,
    patchFileId,
  });
}

export async function setPatchEntryEnabled(
  libraryMetadataPath: string,
  gameId: string,
  patchFileId: string,
  entryId: string,
  enabled: boolean,
): Promise<GamePatchInventory> {
  return invoke<GamePatchInventory>("set_patch_entry_enabled", {
    libraryMetadataPath,
    gameId,
    patchFileId,
    entryId,
    enabled,
  });
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
  libraryMetadataPath: string,
  gameId: string,
): Promise<MaterializedLaunchConfig> {
  return invoke<MaterializedLaunchConfig>("get_materialized_launch_config", {
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
