/**
 * Sidecar invoke bridge for release metadata commands.
 *
 * Each function maps 1:1 to a Rust RPC command in
 * `core/src/commands/release.rs`.
 */

import { invoke } from "../../../platform/bridge";
import type {
  ReleaseMetadata,
  UpdaterReadiness,
  EnvironmentDiagnostic,
} from "../model/releaseTypes";

/**
 * Fetch the full release metadata snapshot for the current build.
 *
 * Includes version, build kind, architecture, release notes URL,
 * and updater readiness.
 */
export async function getReleaseMetadata(): Promise<ReleaseMetadata> {
  return invoke<ReleaseMetadata>("get_release_metadata");
}

/**
 * Check whether the in-app updater is available and fully configured.
 */
export async function getUpdaterReadiness(): Promise<UpdaterReadiness> {
  return invoke<UpdaterReadiness>("get_updater_readiness");
}

/**
 * Run packaged-environment diagnostics and return findings.
 *
 * Returns informational and warning items about the current runtime
 * environment for the UI to display.
 */
export async function getEnvironmentDiagnostics(): Promise<
  EnvironmentDiagnostic[]
> {
  return invoke<EnvironmentDiagnostic[]>("get_environment_diagnostics");
}
