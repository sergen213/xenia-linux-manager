/** Mirrors Rust LibrarySource struct. */
export interface LibrarySource {
  id: string;
  root_path: string;
  label: string;
  created_at: number;
  updated_at: number;
  last_scan_summary: ScanSummarySnapshot | null;
}

/** Lightweight scan summary attached to a source. */
export interface ScanSummarySnapshot {
  found: number;
  duplicates: number;
  warnings: number;
  skipped: number;
  status: string;
  completed_at: number;
}

/** Warning when a new source path overlaps an existing source. */
export interface NestedSourceWarning {
  new_path: string;
  existing_id: string;
  existing_path: string;
  relationship: "child" | "parent";
}

/** Result of adding a library source. */
export interface AddSourceResult {
  source: LibrarySource;
  warnings: NestedSourceWarning[];
}

/** Library status payload from the backend. */
export interface LibraryStatus {
  sources: LibrarySource[];
  active_scans: number;
  queued_scans: number;
}
