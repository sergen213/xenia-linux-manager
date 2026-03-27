# Phase 4: Library Review and Launch Core - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn scan output into a browsable library with game detail views, manual correction/add flows, duplicate and low-confidence review handling, and safe launching through the installed Linux Xenia build. Patches, profiles, saves, and other future management capabilities remain outside this phase.

</domain>

<decisions>
## Implementation Decisions

### Library browsing model
- The default library experience should use a cover grid.
- Main library cards should show the game title and last played time.
- Duplicate and review flags should appear on cards only when relevant.
- Browse in v1 should feel like a richer organizer rather than plain text search only.
- Low-confidence and duplicate candidates should be kept in a separate review tab instead of being mixed into the main library.

### Game detail view and review workflow
- Selecting a game should open a dedicated game details view first.
- The game details view should expose launch and other management actions from that screen.
- Game details must show title identity, executable path, source folder, artwork when available, scan confidence/history, and notes about issues.
- Review flows should support both a queue-style process and a sortable table that lets users jump around freely.
- Duplicate review must let the user decide among all core outcomes: mark one item as primary and keep alternates, merge into one logical game, dismiss false duplicates, or leave the issue flagged for later.

### Manual add and correction flow
- Manual corrections should happen inside the game detail view rather than a separate modal or screen.
- Manual add should require only title and executable path.
- Artwork for manual entries should be fetched by the app scraper rather than entered manually as part of the required form.
- Manual corrections should automatically win over conflicting future scan data.
- Manual entries should remain first-class library items while being visually distinguished as manually managed.

### Launch readiness and preflight messaging
- Launch must hard-block when Xenia is not installed, the executable path is missing, the file no longer exists, duplicate/review state is unresolved, or the source shape is unsupported.
- Blocking failures should be handled on the game detail view with inline recovery actions and a modal that explains available fixes.
- If a title is suspicious but still technically launchable, the app should warn the user, explain what is wrong, and let them decide whether to continue.
- After a successful launch request, the app should confirm that launch started, track a running session state, and update last played immediately.
- The library should later reflect how long the title was played from that tracked session.

### Claude's Discretion
- Exact organizer controls, such as the specific search/filter/sort affordances, as long as the experience remains richer than plain text search.
- Exact visual treatment of review badges, manual-entry markers, and the cover-grid presentation.
- Exact wording and layout for inline preflight recovery actions and warning modals.
- Exact interaction model connecting queue-style review and sortable table review, as long as both modes are available.

</decisions>

<specifics>
## Specific Ideas

- The library should feel like an organizer, not just a launcher list.
- Clicking a game should always land in details first, then launch and correction actions branch from there.
- Manual add stays intentionally lightweight and depends on scraper enrichment for artwork.
- Suspicious-but-launchable titles should surface explicit reasons in the warning before the user chooses whether to continue.

</specifics>

<deferred>
## Deferred Ideas

- Patch management remains in phase 5.
- Profile and community settings flows remain in phase 6.
- Save management remains in phase 7.

</deferred>

---

*Phase: 04-library-review-and-launch-core*
*Context gathered: 2026-03-12*
