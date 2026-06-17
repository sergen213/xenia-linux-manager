/**
 * Sidecar invoke bridge for Xenia lifecycle commands.
 *
 * Each function maps 1:1 to a Rust RPC command in
 * `core/src/commands/xenia.rs`.
 */

import { invoke } from "../../../platform/bridge";
import type { LinuxRelease, InstallState, ReleaseChannel } from "../model/xeniaTypes";

// ---------------------------------------------------------------------------
// Status and update commands
// ---------------------------------------------------------------------------

export async function fetchLatestRelease(
  channel: ReleaseChannel,
): Promise<LinuxRelease> {
  return invoke<LinuxRelease>("fetch_latest_release", { channel });
}

export async function fetchRecentReleases(
  channel: ReleaseChannel,
): Promise<LinuxRelease[]> {
  return invoke<LinuxRelease[]>("fetch_recent_releases", { channel });
}

/** Load the persisted install state (status, manifest, failure context). */
export async function getInstallStatus(
  appDataPath: string,
): Promise<InstallState> {
  return invoke<InstallState>("get_install_status", { appDataPath });
}

export async function switchActiveXeniaBuild(
  appDataPath: string,
  buildId: string,
): Promise<InstallState> {
  return invoke<InstallState>("switch_active_xenia_build", { appDataPath, buildId });
}

/** Check for updates by comparing the installed tag against latest release. */
export async function checkForUpdate(
  installedTag: string,
): Promise<LinuxRelease | null> {
  return invoke<LinuxRelease | null>("check_for_update", { installedTag });
}

/** Check for updates using persisted state (auto-detects installed tag). */
export async function checkForUpdateAuto(
  appDataPath: string,
): Promise<LinuxRelease | null> {
  return invoke<LinuxRelease | null>("check_for_update_auto", { appDataPath });
}

// ---------------------------------------------------------------------------
// Install and update commands
// ---------------------------------------------------------------------------

/** Start a Xenia install job. Returns the job ID for progress tracking. */
export async function startInstall(
  appDataPath: string,
  xeniaPath: string,
  release: LinuxRelease,
): Promise<string> {
  return invoke<string>("start_install", { appDataPath, xeniaPath, release });
}

/** Start a Xenia update job. Returns the job ID for progress tracking. */
export async function startUpdate(
  appDataPath: string,
  xeniaPath: string,
  release: LinuxRelease,
): Promise<string> {
  return invoke<string>("start_update", { appDataPath, xeniaPath, release });
}

/** Retry the last failed operation (install or update). Returns job ID. */
export async function retryLastOperation(
  appDataPath: string,
  xeniaPath: string,
): Promise<string> {
  return invoke<string>("retry_last_operation", { appDataPath, xeniaPath });
}

// ---------------------------------------------------------------------------
// Cleanup and removal commands
// ---------------------------------------------------------------------------

/** Clear failure context without removing the installed build. */
export async function clearInstallFailure(
  appDataPath: string,
): Promise<void> {
  return invoke<void>("clear_install_failure", { appDataPath });
}

/** Clean up staging and download artifacts for a specific release. */
export async function cleanupInstallArtifacts(
  appDataPath: string,
  release: LinuxRelease,
): Promise<void> {
  return invoke<void>("cleanup_install_artifacts", { appDataPath, release });
}

/** Remove the active Xenia installation entirely. */
export async function removeXeniaInstall(
  appDataPath: string,
  xeniaPath: string,
  buildId?: string | null,
): Promise<InstallState> {
  return invoke<InstallState>("remove_xenia_install", {
    appDataPath,
    xeniaPath,
    buildId: buildId ?? null,
  });
}
