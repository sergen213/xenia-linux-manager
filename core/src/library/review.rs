//! Resolved library browse, detail, and review-inbox read model.
//!
//! Converts raw scan catalogs plus the persisted identity overlay into
//! browse-ready payloads that the renderer can consume directly.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::library::artwork;
use crate::library::catalog::{self, CatalogScanSummary, SourceCatalog};
use crate::library::discovery::{CandidateStatus, Confidence, DiscoveredCandidate};
use crate::library::identity::{
    self, GameIdentityRecord, IdentityStore, find_game_by_candidate_path, find_game_by_id,
};
use crate::library::sources::{self, LibrarySource};
use crate::library::titleid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LibraryBrowseCard {
    pub game_id: String,
    pub title: String,
    pub executable_path: String,
    pub source_id: Option<String>,
    pub source_label: String,
    pub kind: String,
    pub confidence: String,
    pub artwork_path: Option<String>,
    pub manual: bool,
    pub review_flag: bool,
    pub duplicate_badge_count: u32,
    pub last_played_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReviewInboxItem {
    pub review_id: String,
    pub game_id: Option<String>,
    pub title: String,
    pub executable_path: String,
    pub source_id: String,
    pub source_label: String,
    pub kind: String,
    pub confidence: String,
    pub status: String,
    pub reason: String,
    pub discovered_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReviewInboxPayload {
    pub queue: Vec<ReviewInboxItem>,
    pub items: Vec<ReviewInboxItem>,
    pub duplicate_count: u32,
    pub low_confidence_count: u32,
    pub warning_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScanEvidence {
    pub path: String,
    pub source_id: String,
    pub source_label: String,
    pub kind: String,
    pub confidence: String,
    pub status: String,
    pub warning: Option<String>,
    pub discovered_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScanHistoryEntry {
    pub source_id: String,
    pub source_label: String,
    pub status: String,
    pub found: u32,
    pub duplicates: u32,
    pub warnings: u32,
    pub completed_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LibraryGameDetails {
    pub game_id: String,
    pub title: String,
    pub executable_path: String,
    pub source_id: Option<String>,
    pub source_label: String,
    pub kind: String,
    pub confidence: String,
    pub artwork_path: Option<String>,
    pub title_id: Option<String>,
    pub preferred_xenia_tag: Option<String>,
    pub launch_environment: Option<String>,
    pub launch_wrapper: Option<String>,
    pub manual: bool,
    pub review_flag: bool,
    pub duplicate_count: u32,
    pub issue_notes: Vec<String>,
    pub last_played_at: Option<u64>,
    pub running_session_started_at: Option<u64>,
    pub evidence: Vec<ScanEvidence>,
    pub scan_history: Vec<ScanHistoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BrowseLibraryPayload {
    pub cards: Vec<LibraryBrowseCard>,
    pub review_inbox_count: u32,
    pub review_duplicate_count: u32,
    pub review_low_confidence_count: u32,
}

struct ReviewContext {
    source_map: HashMap<String, LibrarySource>,
    catalogs: Vec<SourceCatalog>,
    identity_store: IdentityStore,
    library_metadata_path: String,
}

pub fn browse_library(library_metadata_path: &str) -> BrowseLibraryPayload {
    let context = load_context(library_metadata_path);
    let review = build_review_inbox(&context);
    let cards = build_browse_cards(&context, &review.items);

    BrowseLibraryPayload {
        cards,
        review_inbox_count: review.items.len() as u32,
        review_duplicate_count: review.duplicate_count,
        review_low_confidence_count: review.low_confidence_count,
    }
}

pub fn load_review_inbox(library_metadata_path: &str) -> ReviewInboxPayload {
    let context = load_context(library_metadata_path);
    build_review_inbox(&context)
}

pub fn load_game_details(
    library_metadata_path: &str,
    game_id: &str,
) -> Result<LibraryGameDetails, String> {
    let context = load_context(library_metadata_path);
    build_game_details(&context, game_id).ok_or_else(|| format!("Game not found: {game_id}"))
}

fn load_context(library_metadata_path: &str) -> ReviewContext {
    let sources = sources::list_sources(library_metadata_path);
    let source_map = sources
        .iter()
        .map(|source| (source.id.clone(), source.clone()))
        .collect::<HashMap<_, _>>();
    let source_ids = sources
        .iter()
        .map(|source| source.id.clone())
        .collect::<Vec<_>>();
    let catalogs = catalog::load_all_catalogs(library_metadata_path, &source_ids);

    // Browse rewrites the whole identity store (scan records + title-id
    // backfill). Hold the write lock across load+save so a parallel artwork
    // persist on another sidecar task can't have its `artwork_path` reverted by
    // this snapshot — the bug that blanked covers until a restart.
    let identity_store = {
        let _guard = identity::lock_identity_store();
        let mut store = identity::load_identity_store(library_metadata_path);

        for catalog in &catalogs {
            for candidate in &catalog.candidates {
                if is_primary_browse_candidate(candidate) {
                    let _ = identity::ensure_scan_game_record(
                        &mut store,
                        &candidate.source_id,
                        &candidate.label,
                        &candidate.path.to_string_lossy(),
                    );
                }
            }
        }

        // Backfill title IDs for any games that don't have one yet.
        for game in &mut store.games {
            if game.title_id.is_some() {
                continue;
            }
            let path = std::path::Path::new(&game.executable_path);
            if let Some(tid) = titleid::extract_title_id(path) {
                game.title_id = Some(tid);
            }
        }

        let _ = identity::save_identity_store(library_metadata_path, &store);
        store
    };

    ReviewContext {
        source_map,
        catalogs,
        identity_store,
        library_metadata_path: library_metadata_path.to_string(),
    }
}

fn build_browse_cards(
    context: &ReviewContext,
    review_items: &[ReviewInboxItem],
) -> Vec<LibraryBrowseCard> {
    let mut review_counts = HashMap::<String, u32>::new();
    for item in review_items {
        if let Some(game_id) = &item.game_id {
            *review_counts.entry(game_id.clone()).or_insert(0) += 1;
        }
    }

    let mut cards = Vec::new();

    for game in &context.identity_store.games {
        if !game.manual
            && !game.linked_candidate_paths.iter().any(|path| {
                context
                    .catalogs
                    .iter()
                    .flat_map(|catalog| catalog.candidates.iter())
                    .any(|candidate| {
                        is_primary_browse_candidate(candidate)
                            && candidate.path.to_string_lossy() == path.as_str()
                    })
            })
        {
            continue;
        }

        let source_label = game
            .source_id
            .as_ref()
            .and_then(|source_id| context.source_map.get(source_id))
            .map(|source| source.label.clone())
            .unwrap_or_else(|| {
                if game.manual {
                    "Manual Entry".to_string()
                } else {
                    "Unknown Source".to_string()
                }
            });

        let evidence = find_evidence_for_game(context, game);
        let first_evidence = evidence.first();
        cards.push(LibraryBrowseCard {
            game_id: game.game_id.clone(),
            title: game.title.clone(),
            executable_path: game.executable_path.clone(),
            source_id: game.source_id.clone(),
            source_label,
            kind: first_evidence
                .map(|item| item.kind.clone())
                .unwrap_or_else(|| "manual".to_string()),
            confidence: first_evidence
                .map(|item| item.confidence.clone())
                .unwrap_or_else(|| "manual".to_string()),
            artwork_path: game
            .artwork_path
            .clone()
            .or_else(|| artwork::cached_artwork_path(&context.library_metadata_path, &game.game_id)),
            manual: game.manual,
            review_flag: review_counts
                .get(&game.game_id)
                .copied()
                .unwrap_or_default()
                > 0,
            duplicate_badge_count: review_counts
                .get(&game.game_id)
                .copied()
                .unwrap_or_default(),
            last_played_at: game.last_played_at,
        });
    }

    cards.sort_by(|left, right| {
        right
            .last_played_at
            .cmp(&left.last_played_at)
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
    });

    cards
}

fn build_review_inbox(context: &ReviewContext) -> ReviewInboxPayload {
    let mut items = Vec::new();
    let mut duplicate_count = 0;
    let mut low_confidence_count = 0;
    let mut warning_count = 0;

    for catalog in &context.catalogs {
        for candidate in &catalog.candidates {
            if !needs_review(candidate) {
                continue;
            }

            let source = context.source_map.get(&candidate.source_id);
            let review_id = identity::review_key_for_path(&candidate.path.to_string_lossy());
            let resolution = context
                .identity_store
                .duplicate_resolutions
                .iter()
                .find(|resolution| resolution.review_key == review_id);
            if resolution
                .map(|resolution| {
                    resolution.kind == identity::DuplicateResolutionKind::DismissFalseDuplicate
                })
                .unwrap_or(false)
            {
                continue;
            }

            if candidate.status == CandidateStatus::Duplicate {
                duplicate_count += 1;
            }
            if candidate.confidence == Confidence::Low {
                low_confidence_count += 1;
            }
            if candidate.status == CandidateStatus::Warning {
                warning_count += 1;
            }

            let linked_game = find_game_by_candidate_path(
                &context.identity_store,
                &candidate.path.to_string_lossy(),
            );
            items.push(ReviewInboxItem {
                review_id,
                game_id: linked_game.map(|game| game.game_id.clone()),
                title: linked_game
                    .map(|game| game.title.clone())
                    .unwrap_or_else(|| candidate.label.clone()),
                executable_path: candidate.path.to_string_lossy().to_string(),
                source_id: candidate.source_id.clone(),
                source_label: source
                    .map(|source| source.label.clone())
                    .unwrap_or_else(|| candidate.source_id.clone()),
                kind: candidate_kind(candidate),
                confidence: candidate_confidence(candidate),
                status: candidate_status(candidate),
                reason: candidate
                    .warning
                    .clone()
                    .unwrap_or_else(|| review_reason(candidate)),
                discovered_at: candidate.discovered_at,
            });
        }
    }

    items.sort_by(|left, right| {
        right
            .discovered_at
            .cmp(&left.discovered_at)
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
    });

    ReviewInboxPayload {
        queue: items.iter().take(3).cloned().collect(),
        items,
        duplicate_count,
        low_confidence_count,
        warning_count,
    }
}

fn build_game_details(context: &ReviewContext, game_id: &str) -> Option<LibraryGameDetails> {
    let game = find_game_by_id(&context.identity_store, game_id)?;
    let evidence = find_evidence_for_game(context, game);
    let source_label = game
        .source_id
        .as_ref()
        .and_then(|source_id| context.source_map.get(source_id))
        .map(|source| source.label.clone())
        .unwrap_or_else(|| {
            if game.manual {
                "Manual Entry".to_string()
            } else {
                "Unknown Source".to_string()
            }
        });
    let duplicate_count = build_review_inbox(context)
        .items
        .iter()
        .filter(|item| item.game_id.as_deref() == Some(game_id))
        .count() as u32;
    let first_evidence = evidence.first();

    Some(LibraryGameDetails {
        game_id: game.game_id.clone(),
        title: game.title.clone(),
        executable_path: game.executable_path.clone(),
        source_id: game.source_id.clone(),
        source_label,
        kind: first_evidence
            .map(|item| item.kind.clone())
            .unwrap_or_else(|| "manual".to_string()),
        confidence: first_evidence
            .map(|item| item.confidence.clone())
            .unwrap_or_else(|| "manual".to_string()),
        artwork_path: game
            .artwork_path
            .clone()
            .or_else(|| artwork::cached_artwork_path(&context.library_metadata_path, &game.game_id)),
        title_id: game.title_id.clone(),
        preferred_xenia_tag: game.preferred_xenia_tag.clone(),
        launch_environment: game.launch_environment.clone(),
        launch_wrapper: game.launch_wrapper.clone(),
        manual: game.manual,
        review_flag: duplicate_count > 0,
        duplicate_count,
        issue_notes: game.issue_notes.clone(),
        last_played_at: game.last_played_at,
        running_session_started_at: game
            .running_session
            .as_ref()
            .map(|running| running.started_at),
        evidence,
        scan_history: build_scan_history(context),
    })
}

fn build_scan_history(context: &ReviewContext) -> Vec<ScanHistoryEntry> {
    let mut entries = Vec::new();
    for catalog in &context.catalogs {
        if let Some(summary) = &catalog.last_scan_summary {
            let source_label = context
                .source_map
                .get(&catalog.source_id)
                .map(|source| source.label.clone())
                .unwrap_or_else(|| catalog.source_id.clone());
            entries.push(scan_history_entry(
                &catalog.source_id,
                &source_label,
                summary,
            ));
        }
    }
    entries.sort_by(|left, right| right.completed_at.cmp(&left.completed_at));
    entries
}

fn scan_history_entry(
    source_id: &str,
    source_label: &str,
    summary: &CatalogScanSummary,
) -> ScanHistoryEntry {
    ScanHistoryEntry {
        source_id: source_id.to_string(),
        source_label: source_label.to_string(),
        status: summary.status.clone(),
        found: summary.found,
        duplicates: summary.duplicates,
        warnings: summary.warnings,
        completed_at: summary.completed_at,
    }
}

fn find_evidence_for_game(context: &ReviewContext, game: &GameIdentityRecord) -> Vec<ScanEvidence> {
    let mut evidence = context
        .catalogs
        .iter()
        .flat_map(|catalog| catalog.candidates.iter())
        .filter(|candidate| {
            candidate.path.to_string_lossy() == game.executable_path
                || game
                    .linked_candidate_paths
                    .iter()
                    .any(|path| path == &candidate.path.to_string_lossy())
        })
        .map(|candidate| ScanEvidence {
            path: candidate.path.to_string_lossy().to_string(),
            source_id: candidate.source_id.clone(),
            source_label: context
                .source_map
                .get(&candidate.source_id)
                .map(|source| source.label.clone())
                .unwrap_or_else(|| candidate.source_id.clone()),
            kind: candidate_kind(candidate),
            confidence: candidate_confidence(candidate),
            status: candidate_status(candidate),
            warning: candidate.warning.clone(),
            discovered_at: candidate.discovered_at,
        })
        .collect::<Vec<_>>();
    evidence.sort_by(|left, right| right.discovered_at.cmp(&left.discovered_at));
    evidence
}

fn is_primary_browse_candidate(candidate: &DiscoveredCandidate) -> bool {
    candidate.status == CandidateStatus::Found && candidate.confidence != Confidence::Low
}

fn needs_review(candidate: &DiscoveredCandidate) -> bool {
    candidate.status == CandidateStatus::Duplicate
        || candidate.status == CandidateStatus::Warning
        || candidate.confidence == Confidence::Low
}

fn review_reason(candidate: &DiscoveredCandidate) -> String {
    match candidate.status {
        CandidateStatus::Duplicate => "Possible duplicate needs resolution".to_string(),
        CandidateStatus::Warning => "Scan warning needs review".to_string(),
        CandidateStatus::Skipped => "Skipped candidate".to_string(),
        CandidateStatus::Found => {
            if candidate.confidence == Confidence::Low {
                "Low-confidence match should be reviewed".to_string()
            } else {
                "Review required".to_string()
            }
        }
    }
}

fn candidate_kind(candidate: &DiscoveredCandidate) -> String {
    match candidate.kind {
        crate::library::discovery::CandidateKind::Xex => "xex".to_string(),
        crate::library::discovery::CandidateKind::Iso => "iso".to_string(),
    }
}

fn candidate_confidence(candidate: &DiscoveredCandidate) -> String {
    match candidate.confidence {
        Confidence::High => "high".to_string(),
        Confidence::Medium => "medium".to_string(),
        Confidence::Low => "low".to_string(),
    }
}

fn candidate_status(candidate: &DiscoveredCandidate) -> String {
    match candidate.status {
        CandidateStatus::Found => "found".to_string(),
        CandidateStatus::Duplicate => "duplicate".to_string(),
        CandidateStatus::Warning => "warning".to_string(),
        CandidateStatus::Skipped => "skipped".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::catalog::save_catalog;
    use crate::library::discovery::{CandidateKind, Confidence};
    use crate::library::sources::{self, ScanSummarySnapshot};
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(suffix: &str) -> String {
        let path = env::temp_dir().join("xlm-library-review").join(suffix);
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().to_string()
    }

    fn seed_source(dir: &str, label: &str, path: &str) -> String {
        let added = sources::add_source(dir, path).unwrap();
        let mut source = added.source;
        source.label = label.to_string();
        source.last_scan_summary = Some(ScanSummarySnapshot {
            found: 1,
            duplicates: 1,
            warnings: 1,
            skipped: 0,
            status: "completed".into(),
            completed_at: 2_000,
        });
        let sources_path = PathBuf::from(dir).join("library-sources.json");
        let existing = vec![source.clone()];
        fs::write(
            &sources_path,
            serde_json::to_string_pretty(&existing).unwrap(),
        )
        .unwrap();
        source.id
    }

    fn candidate(
        source_id: &str,
        path: &str,
        label: &str,
        status: CandidateStatus,
        confidence: Confidence,
        warning: Option<&str>,
    ) -> DiscoveredCandidate {
        DiscoveredCandidate {
            path: PathBuf::from(path),
            label: label.into(),
            source_id: source_id.into(),
            kind: CandidateKind::Xex,
            confidence,
            status,
            size_bytes: 1024,
            warning: warning.map(str::to_string),
            discovered_at: 1_000,
        }
    }

    #[test]
    fn browse_library_returns_only_curated_cards() {
        let dir = temp_dir("browse");
        let source_id = seed_source(&dir, "SSD Games", "/games");
        save_catalog(
            &dir,
            &SourceCatalog {
                source_id: source_id.clone(),
                candidates: vec![
                    candidate(
                        &source_id,
                        "/games/Halo 3/default.xex",
                        "Halo 3",
                        CandidateStatus::Found,
                        Confidence::High,
                        None,
                    ),
                    candidate(
                        &source_id,
                        "/games/Unknown/default.iso",
                        "Unknown",
                        CandidateStatus::Found,
                        Confidence::Low,
                        Some("Low confidence"),
                    ),
                ],
                last_scan_summary: Some(CatalogScanSummary {
                    found: 1,
                    duplicates: 0,
                    warnings: 1,
                    skipped: 0,
                    errors: 0,
                    status: "completed".into(),
                    completed_at: 1_000,
                    was_cancelled: false,
                }),
            },
        )
        .unwrap();

        let browse = browse_library(&dir);
        assert_eq!(browse.cards.len(), 1);
        assert_eq!(browse.cards[0].title, "Halo 3");
        assert_eq!(browse.review_inbox_count, 1);
    }

    #[test]
    fn review_inbox_separates_duplicates_and_low_confidence_items() {
        let dir = temp_dir("review");
        let source_id = seed_source(&dir, "NAS", "/nas/games");
        save_catalog(
            &dir,
            &SourceCatalog {
                source_id: source_id.clone(),
                candidates: vec![
                    candidate(
                        &source_id,
                        "/nas/games/Forza/default.xex",
                        "Forza",
                        CandidateStatus::Duplicate,
                        Confidence::High,
                        Some("Duplicate"),
                    ),
                    candidate(
                        &source_id,
                        "/nas/games/Weird/default.iso",
                        "Weird",
                        CandidateStatus::Found,
                        Confidence::Low,
                        Some("Generic ISO"),
                    ),
                ],
                last_scan_summary: Some(CatalogScanSummary {
                    found: 1,
                    duplicates: 1,
                    warnings: 0,
                    skipped: 0,
                    errors: 0,
                    status: "completed".into(),
                    completed_at: 1_000,
                    was_cancelled: false,
                }),
            },
        )
        .unwrap();

        let inbox = load_review_inbox(&dir);
        assert_eq!(inbox.items.len(), 2);
        assert_eq!(inbox.duplicate_count, 1);
        assert_eq!(inbox.low_confidence_count, 1);
    }
}
