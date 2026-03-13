/**
 * Tauri invoke bridge for library source and scan commands.
 *
 * Each function maps 1:1 to a Rust `#[tauri::command]` in
 * `src-tauri/src/commands/library.rs`.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  AddSourceResult,
  LibrarySource,
  LibraryStatus,
} from "../model/libraryTypes";

/** Add a new library source folder. */
export async function addLibrarySource(
  libraryMetadataPath: string,
  path: string,
): Promise<AddSourceResult> {
  return invoke<AddSourceResult>("add_library_source", {
    libraryMetadataPath,
    path,
  });
}

/** List all registered library sources. */
export async function listLibrarySources(
  libraryMetadataPath: string,
): Promise<LibrarySource[]> {
  return invoke<LibrarySource[]>("list_library_sources", {
    libraryMetadataPath,
  });
}

/** Remove a library source by ID. */
export async function removeLibrarySource(
  libraryMetadataPath: string,
  sourceId: string,
): Promise<LibrarySource> {
  return invoke<LibrarySource>("remove_library_source", {
    libraryMetadataPath,
    sourceId,
  });
}

/** Start a scan job for a single library source. Returns job ID. */
export async function startSourceScan(
  libraryMetadataPath: string,
  sourceId: string,
): Promise<string> {
  return invoke<string>("start_source_scan", {
    libraryMetadataPath,
    sourceId,
  });
}

/** Start scans for all registered sources concurrently. Returns job IDs. */
export async function scanAllSources(
  libraryMetadataPath: string,
): Promise<string[]> {
  return invoke<string[]>("scan_all_sources", {
    libraryMetadataPath,
  });
}

/** Cancel an active or queued scan job. */
export async function cancelScan(
  appDataPath: string,
  jobId: string,
): Promise<void> {
  return invoke<void>("cancel_scan", {
    appDataPath,
    jobId,
  });
}

/** Get current library status (sources + scan state). */
export async function getLibraryStatus(
  libraryMetadataPath: string,
): Promise<LibraryStatus> {
  return invoke<LibraryStatus>("get_library_status", {
    libraryMetadataPath,
  });
}
