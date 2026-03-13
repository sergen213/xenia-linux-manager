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

// ---------------------------------------------------------------------------
// Discovery / Catalog types (mirrors Rust catalog + discovery models)
// ---------------------------------------------------------------------------

/** Confidence level for a detected candidate. */
export type Confidence = "high" | "medium" | "low";

/** The type of candidate detected. */
export type CandidateKind = "xex" | "iso";

/** Status of an individual candidate record. */
export type CandidateStatus = "found" | "duplicate" | "warning" | "skipped";

/** A single discovered game candidate. */
export interface DiscoveredCandidate {
  path: string;
  label: string;
  source_id: string;
  kind: CandidateKind;
  confidence: Confidence;
  status: CandidateStatus;
  size_bytes: number;
  warning: string | null;
  discovered_at: number;
}

/** Detailed scan summary stored in the catalog. */
export interface CatalogScanSummary {
  found: number;
  duplicates: number;
  warnings: number;
  skipped: number;
  errors: number;
  status: string;
  completed_at: number;
  was_cancelled: boolean;
}

/** On-disk catalog for a single source. */
export interface SourceCatalog {
  source_id: string;
  candidates: DiscoveredCandidate[];
  last_scan_summary: CatalogScanSummary | null;
}
