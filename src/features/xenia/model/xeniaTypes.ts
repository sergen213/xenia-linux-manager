/**
 * TypeScript types mirroring the Rust Xenia install-state and release models.
 *
 * These types are the renderer-side contract for data flowing from the
 * backend lifecycle commands via Tauri invoke.
 */

// ---------------------------------------------------------------------------
// Release metadata (mirrors releases::LinuxRelease)
// ---------------------------------------------------------------------------

export type ReleaseChannel = "canary" | "edge";

export interface LinuxRelease {
  channel: ReleaseChannel;
  tag: string;
  release_name: string;
  build_id: string;
  published_at: string;
  html_url: string;
  asset_name: string;
  download_url: string;
  size_bytes: number;
}

// ---------------------------------------------------------------------------
// Install state (mirrors install_state.rs types)
// ---------------------------------------------------------------------------

export type LifecycleStatus =
  | "not_installed"
  | "installed"
  | "install_failed"
  | "update_failed";

export type RetryMode = "install" | "update";

export interface InstallManifest {
  channel: ReleaseChannel;
  build_id: string;
  tag: string;
  release_name: string;
  published_at: string;
  html_url: string;
  asset_name: string;
  executable_path: string;
  install_dir: string;
  installed_at: number;
}

export interface FailureContext {
  retry_mode: RetryMode;
  error: string;
  failed_step: string;
  channel: ReleaseChannel;
  target_tag: string;
  target_build_id: string;
  failed_at: number;
}

export interface InstallState {
  status: LifecycleStatus;
  manifest: InstallManifest | null;
  installed_builds: InstallManifest[];
  failure: FailureContext | null;
}

// ---------------------------------------------------------------------------
// Adaptive action (derived in the renderer)
// ---------------------------------------------------------------------------

/** The primary action the dashboard should present based on lifecycle state. */
export type PrimaryAction = "install" | "update" | "retry" | "check_update";

/** Human-readable label for the primary action. */
export function primaryActionLabel(action: PrimaryAction): string {
  switch (action) {
    case "install":
      return "Install";
    case "update":
      return "Update";
    case "retry":
      return "Retry";
    case "check_update":
      return "Check for updates";
  }
}

/** Derive the primary action from lifecycle and update-available state. */
export function derivePrimaryAction(
  status: LifecycleStatus,
  updateAvailable: boolean,
): PrimaryAction {
  switch (status) {
    case "not_installed":
      return "install";
    case "installed":
      return updateAvailable ? "update" : "check_update";
    case "install_failed":
    case "update_failed":
      return "retry";
  }
}

/** Human-readable label for a lifecycle status. */
export function lifecycleStatusLabel(status: LifecycleStatus): string {
  switch (status) {
    case "not_installed":
      return "Not Installed";
    case "installed":
      return "Installed";
    case "install_failed":
      return "Install Failed";
    case "update_failed":
      return "Update Failed";
  }
}

export function channelLabel(channel: ReleaseChannel): string {
  return channel === "edge" ? "Xenia Edge" : "Xenia Canary";
}

export function buildLabel(build: Pick<InstallManifest, "channel" | "tag">): string {
  return `${channelLabel(build.channel)} • ${build.tag}`;
}
