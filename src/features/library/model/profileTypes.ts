/** Source provenance for a profile. */
export type ProfileSourceKind = "local" | "recommended";

/** Linkage metadata for profiles applied from a recommendation source. */
export interface RecommendationLinkage {
  source_id: string;
  source_label: string;
  applied_at: number;
}

/** Summary of a single profile in the inventory. */
export interface ProfileSummary {
  id: string;
  name: string;
  source: ProfileSourceKind;
  active: boolean;
  override_count: number;
  created_at: number;
  updated_at: number;
  recommendation_linkage?: RecommendationLinkage | null;
}

/** Full profile inventory for a game. */
export interface ProfileInventory {
  game_id: string;
  active_profile_id: string | null;
  profiles: ProfileSummary[];
}

/** A single field in the effective config with change tracking. */
export interface EffectiveField {
  key: string;
  value: unknown;
  changed: boolean;
}

/** Full effective config for a profile. */
export interface EffectiveConfig {
  profile_id: string;
  game_id: string;
  fields: EffectiveField[];
  explicit_overrides: Record<string, unknown>;
  changed_count: number;
  total_count: number;
  source: ProfileSourceKind;
  recommendation_linkage?: RecommendationLinkage | null;
}

/** Why a recommendation is not available. */
export type UnsupportedReason =
  | "no_source_configured"
  | "title_not_covered"
  | { source_error: string };

/** Outcome of a recommendation availability check. */
export type RecommendationAvailability =
  | {
      status: "available";
      source_id: string;
      source_label: string;
      baseline: Record<string, unknown>;
    }
  | {
      status: "unsupported";
      reason: UnsupportedReason;
    };

/** Explicit profile document with sparse overrides. */
export interface ProfileDocument {
  version: number;
  profile_id: string;
  game_id: string;
  overrides: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Materialized launch config types
// ---------------------------------------------------------------------------

/** A single key-changed setting for summary display. */
export interface KeyChangeSummary {
  key: string;
  value: unknown;
  label: string;
}

/** Summary of the active patch file applied at launch. */
export interface MaterializedPatchSummary {
  patch_file_id: string;
  file_name: string;
  active_entry_count: number;
  entries: Array<{
    entry_id: string;
    title: string;
    enabled: boolean;
  }>;
}

/** Full launch-time materialized config combining profile and patch state. */
export interface MaterializedLaunchConfig {
  game_id: string;
  profile_id: string | null;
  profile_name: string | null;
  effective_fields: EffectiveField[];
  explicit_overrides: Record<string, unknown>;
  changed_setting_count: number;
  key_changes: KeyChangeSummary[];
  patch_summary: MaterializedPatchSummary | null;
  materialized_at: number;
}
