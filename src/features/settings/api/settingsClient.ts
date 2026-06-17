/**
 * Sidecar invoke bridge for settings commands.
 *
 * Each function maps 1:1 to a Rust RPC command in
 * `core/src/commands/settings.rs`.
 */

import { invoke } from "../../../platform/bridge";
import type {
  AppSettings,
  SettingsValidation,
} from "../model/settingsSchema";

/** Get recommended default settings (no disk read). */
export async function getDefaultSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_default_settings");
}

/** Load persisted settings with validation (falls back to defaults). */
export async function loadSettings(): Promise<
  [AppSettings, SettingsValidation]
> {
  return invoke<[AppSettings, SettingsValidation]>("load_settings");
}

/** Validate and persist settings. Rejects if any path is unusable. */
export async function saveSettings(
  settings: AppSettings,
): Promise<SettingsValidation> {
  return invoke<SettingsValidation>("save_settings", { settings });
}

/** Validate paths without saving (for real-time UI feedback). */
export async function validatePaths(
  settings: AppSettings,
): Promise<SettingsValidation> {
  return invoke<SettingsValidation>("validate_paths", { settings });
}
