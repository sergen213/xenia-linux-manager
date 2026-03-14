/** Types for the save portability and safety domain. */

/** Category of exportable/importable content. */
export type ExportCategory = "save" | "settings" | "patches";

/** A single exportable item within a game's save roots. */
export interface ExportableItem {
  label: string;
  path: string;
  category: ExportCategory;
  size_bytes: number;
  exists: boolean;
}

/** Preflight result describing what can be exported for a game. */
export interface ExportPreflight {
  game_id: string;
  game_title: string;
  items: ExportableItem[];
  blockers: string[];
  can_export: boolean;
}

/** Result of a completed export operation. */
export interface ExportResult {
  game_id: string;
  game_title: string;
  archive_path: string;
  archive_filename: string;
  items_exported: number;
  total_size_bytes: number;
}

/** A single item in the archive manifest. */
export interface ManifestItem {
  archive_path: string;
  original_path: string;
  category: ExportCategory;
  label: string;
  size_bytes: number;
}

/** Metadata manifest embedded in every portable save archive. */
export interface ArchiveManifest {
  archive_version: number;
  game_id: string;
  game_title: string;
  exported_at: number;
  items: ManifestItem[];
  total_size_bytes: number;
  created_by: string;
}

/** Result of inspecting an archive for import. */
export interface ImportInspection {
  manifest: ArchiveManifest;
  staging_path: string;
  game_found: boolean;
  target_game_id: string | null;
  target_game_title: string | null;
  verification_warnings: string[];
}

/** Planned action for a single item during import. */
export type ConflictAction =
  | "new"
  | "replace"
  | "rename_keep_both"
  | "skip"
  | "unresolved";

/** A single item in the conflict plan. */
export interface ConflictPlanItem {
  archive_path: string;
  label: string;
  category: ExportCategory;
  local_exists: boolean;
  action: ConflictAction;
  explanation: string;
}

/** User-selectable conflict resolution policy. */
export type ConflictPolicy = "replace_all" | "keep_both_if_possible" | "cancel";

/** Full conflict plan for an import operation. */
export interface ConflictPlan {
  game_id: string;
  game_title: string;
  source_game_id: string;
  source_game_title: string;
  items: ConflictPlanItem[];
  has_conflicts: boolean;
  policy: ConflictPolicy;
}

/** Per-item apply status. */
export type ApplyItemStatus = "success" | "failed" | "skipped";

/** Per-item result of the apply step. */
export interface ApplyItemResult {
  archive_path: string;
  label: string;
  status: ApplyItemStatus;
  detail: string;
}

/** Full result of an import apply operation. */
export interface ImportApplyResult {
  game_id: string;
  game_title: string;
  backup_path: string | null;
  items: ApplyItemResult[];
  success_count: number;
  failed_count: number;
  skipped_count: number;
}

/** A single backup archive entry. */
export interface BackupEntry {
  filename: string;
  path: string;
  size_bytes: number;
}

/** Steps in the guided import wizard flow. */
export type ImportWizardStep =
  | "idle"
  | "inspect"
  | "select_target"
  | "conflict_review"
  | "backup_warning"
  | "applying"
  | "result";
