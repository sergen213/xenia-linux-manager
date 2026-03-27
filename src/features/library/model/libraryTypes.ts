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

export type Confidence = "high" | "medium" | "low";
export type CandidateKind = "xex" | "iso";
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

export interface RunningSession {
  started_at: number;
  xenia_executable: string;
  game_executable: string;
}

export interface GameIdentityRecord {
  game_id: string;
  title: string;
  executable_path: string;
  source_id: string | null;
  linked_candidate_paths: string[];
  manual: boolean;
  issue_notes: string[];
  review_state: "clean" | "needs_review" | "dismissed";
  artwork_path: string | null;
  last_played_at: number | null;
  running_session: RunningSession | null;
  created_at: number;
  updated_at: number;
}

export interface ManualGameInput {
  title: string;
  executable_path: string;
}

export interface UpdateGameIdentityInput {
  game_id: string;
  title: string;
  executable_path: string;
  issue_notes: string[];
}

export type DuplicateResolutionKind =
  | "keep_primary"
  | "merge"
  | "dismiss_false_duplicate"
  | "leave_flagged";

export interface DuplicateResolutionInput {
  review_key: string;
  kind: DuplicateResolutionKind;
  primary_game_id: string | null;
  alternate_game_ids: string[];
}

export interface DuplicateResolutionRecord {
  review_key: string;
  kind: DuplicateResolutionKind;
  primary_game_id: string | null;
  alternate_game_ids: string[];
  updated_at: number;
}

export interface LibraryBrowseCard {
  game_id: string;
  title: string;
  executable_path: string;
  source_id: string | null;
  source_label: string;
  kind: string;
  confidence: string;
  artwork_path: string | null;
  manual: boolean;
  review_flag: boolean;
  duplicate_badge_count: number;
  last_played_at: number | null;
}

export interface ReviewInboxItem {
  review_id: string;
  game_id: string | null;
  title: string;
  executable_path: string;
  source_id: string;
  source_label: string;
  kind: string;
  confidence: string;
  status: string;
  reason: string;
  discovered_at: number;
}

export interface ReviewInboxPayload {
  queue: ReviewInboxItem[];
  items: ReviewInboxItem[];
  duplicate_count: number;
  low_confidence_count: number;
  warning_count: number;
}

export interface ScanEvidence {
  path: string;
  source_id: string;
  source_label: string;
  kind: string;
  confidence: string;
  status: string;
  warning: string | null;
  discovered_at: number;
}

export interface ScanHistoryEntry {
  source_id: string;
  source_label: string;
  status: string;
  found: number;
  duplicates: number;
  warnings: number;
  completed_at: number;
}

export interface LibraryGameDetails {
  game_id: string;
  title: string;
  executable_path: string;
  source_id: string | null;
  source_label: string;
  kind: string;
  confidence: string;
  artwork_path: string | null;
  title_id: string | null;
  preferred_xenia_tag: string | null;
  manual: boolean;
  review_flag: boolean;
  duplicate_count: number;
  issue_notes: string[];
  last_played_at: number | null;
  running_session_started_at: number | null;
  evidence: ScanEvidence[];
  scan_history: ScanHistoryEntry[];
}

export interface GameContentEntry {
  content_type: string;
  content_type_label: string;
  path: string;
  item_count: number;
}

export interface GameInstalledContent {
  game_id: string;
  game_title: string;
  title_id: string | null;
  content_root: string;
  exists: boolean;
  entries: GameContentEntry[];
}

export interface ContentImportResult {
  content_type: string;
  destination_path: string;
  overwritten: boolean;
}

export interface ContentRemoveResult {
  removed_path: string;
}

export interface BrowseLibraryPayload {
  cards: LibraryBrowseCard[];
  review_inbox_count: number;
  review_duplicate_count: number;
  review_low_confidence_count: number;
}

export interface LaunchPreflight {
  game_id: string;
  game_title: string;
  game_executable_path: string;
  xenia_executable_path: string | null;
  blockers: string[];
  warnings: string[];
  can_launch: boolean;
  requires_confirmation: boolean;
}

export interface LaunchResult {
  game_id: string;
  started_at: number;
  pid: number;
}
