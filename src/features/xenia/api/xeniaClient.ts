/**
 * Tauri invoke bridge for Xenia lifecycle commands.
 *
 * Each function maps 1:1 to a Rust `#[tauri::command]` in
 * `src-tauri/src/commands/xenia.rs`.
 */

import { invoke } from "@tauri-apps/api/core";
import type { LinuxRelease, InstallState } from "../model/xeniaTypes";

// ---------------------------------------------------------------------------
// Status and update commands
// ---------------------------------------------------------------------------

/** Fetch the latest Linux Xenia Canary release metadata from GitHub. */
export async function fetchLatestRelease(): Promise<LinuxRelease> {
  return invoke<LinuxRelease>("fetch_latest_release");
}

/** Load the persisted install state (status, manifest, failure context). */
export async function getInstallStatus(
  appDataPath: string,
): Promise<InstallState> {
  return invoke<InstallState>("get_install_status", { appDataPath });
}

export async function switchActiveXeniaBuild(
  appDataPath: string,
  tag: string,
): Promise<InstallState> {
  return invoke<InstallState>("switch_active_xenia_build", { appDataPath, tag });
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
): Promise<void> {
  return invoke<void>("remove_xenia_install", { appDataPath, xeniaPath });
}
