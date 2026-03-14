/** Source provenance for a profile. */
export type ProfileSourceKind = "local";

/** Summary of a single profile in the inventory. */
export interface ProfileSummary {
  id: string;
  name: string;
  source: ProfileSourceKind;
  active: boolean;
  override_count: number;
  created_at: number;
  updated_at: number;
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
}

/** Explicit profile document with sparse overrides. */
export interface ProfileDocument {
  version: number;
  profile_id: string;
  game_id: string;
  overrides: Record<string, unknown>;
}
