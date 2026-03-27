# Phase 3: Library Source Management and Scanning - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Let users register local game source folders and populate library metadata by scanning for `.xex` and ISO-backed content. This phase covers source management, scan orchestration, scan feedback, and persisted discovery results. Library browsing, manual correction, and launch behavior remain in later phases.

</domain>

<decisions>
## Implementation Decisions

### Source folder rules
- Users can add parent folders and scans should recurse through subfolders.
- Nested sources are allowed, but the app should warn when a newly added source is already contained within an existing registered source.
- Removing a source should immediately remove scan results tied to that source.
- Network-mounted folders are supported in v1 as long as Linux exposes them as normal filesystem paths.

### Scan triggering and cadence
- Adding a new source should start scanning immediately.
- Existing sources should be rescanned both automatically on app launch and manually on user request.
- Users should be able to run scans for a single source or for all configured sources.
- New scan requests should queue by default while another scan is active.
- `Scan All Now` should override the queue and start scans for all sources immediately, including queued work, so they run concurrently.

### Scan progress and result feedback
- Running scans should show deep live detail rather than only coarse status.
- Completed scans should show a full summary including found items, skipped items, duplicates, and warnings.
- Permission errors, disconnected mounts, and unreadable files should produce a partially successful scan with warnings rather than a full failure.
- Users should be able to cancel a running scan.
- Partial discoveries found before cancellation should be kept in library metadata.

### Candidate handling for `.xex` and ISO discoveries
- The app should list every `.xex` and ISO candidate it finds, even when confidence is low.
- Duplicate findings should be surfaced as duplicates needing review later rather than being merged automatically in this phase.
- ISO discovery can be heuristic in phase 3; likely ISO candidates should be persisted and cleaned up during phase 4 review flows.
- Ambiguous or suspicious findings should be skipped, logged, and surfaced to the user so they know a decision point exists about whether to keep them.

### Claude's Discretion
- Exact UI layout for source management and scan progress presentation.
- Exact wording and placement of nested-source warnings and partial-success messaging.
- Whether the user-facing follow-up for skipped suspicious items appears inline in scan results, in a review queue, or another standard pattern, as long as the skipped/logged decision remains visible.

</decisions>

<specifics>
## Specific Ideas

- The user wants a `Scan All Now` action that bypasses the normal queue and launches all source scans concurrently.
- The user explicitly wants partial scan discoveries to remain persisted even when a scan is canceled.

</specifics>

<deferred>
## Deferred Ideas

- Duplicate cleanup and manual resolution workflow belongs in phase 4.
- Any richer user decision flow for re-including skipped suspicious items should stay within the later review/correction scope if it expands beyond basic visibility.

</deferred>

---

*Phase: 03-library-source-management-and-scanning*
*Context gathered: 2026-03-12*
