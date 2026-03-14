/**
 * Types for the release metadata contract between the Rust backend and the
 * React renderer.
 *
 * Mirrors the Rust types in `src-tauri/src/release/mod.rs`.
 */

/** How the app is running. */
export type BuildKind = "packaged_appimage" | "dev";

/** Whether the in-app updater is available and why. */
export interface UpdaterReadiness {
  /** Whether all updater prerequisites are met. */
  available: boolean;
  /** Human-readable explanation of the current state. */
  reason: string;
  /** Whether the running build is a packaged AppImage. */
  is_packaged: boolean;
  /** Whether the updater signing key is configured. */
  has_pubkey: boolean;
  /** Whether at least one updater endpoint is configured. */
  has_endpoints: boolean;
}

/** Full release metadata snapshot from the backend. */
export interface ReleaseMetadata {
  /** Semantic version string (e.g. "0.1.0"). */
  version: string;
  /** Classification of the running build. */
  build_kind: BuildKind;
  /** Human-readable label for the build kind (e.g. "Development"). */
  build_kind_label: string;
  /** Target architecture (e.g. "x86_64"). */
  architecture: string;
  /** URL to release notes for the current version. */
  release_notes_url: string;
  /** Updater availability and diagnostics. */
  updater: UpdaterReadiness;
}

/** Severity of an environment diagnostic finding. */
export type DiagnosticSeverity = "info" | "warning";

/** A single environment diagnostic finding. */
export interface EnvironmentDiagnostic {
  /** Short identifier for the check. */
  id: string;
  /** Human-readable summary. */
  summary: string;
  /** Technical detail (hidden behind expandable UI by default). */
  detail: string | null;
  /** Severity classification. */
  severity: DiagnosticSeverity;
}
