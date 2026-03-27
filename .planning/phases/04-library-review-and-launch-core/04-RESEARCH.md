# Phase 4 Research: Library Review and Launch Core

**Researched:** 2026-03-13
**Phase:** 4 - Library Review and Launch Core
**Requirements:** LIB-04, LIB-05, LAUN-01, LAUN-03

## Question

What does Phase 4 need so scan output becomes a usable game library with detail-first review flows, manual correction that survives rescans, and safe launching through the installed Linux Xenia build?

## Recommended Technical Direction

### Keep scan evidence and user-curated identity as separate backend layers

- Treat the Phase 3 scan catalog as raw evidence, not the final game library.
- Add a persisted review and identity layer under `library_metadata_path` that overlays:
  - canonical game id
  - linked candidate ids
  - manual title / executable overrides
  - duplicate resolution state
  - review status
  - notes / issue flags
  - `last_played_at` and session metadata
- Manual corrections must win over future scan imports. The safest contract is:
  - scan jobs continue updating candidate evidence
  - review state stores user decisions separately
  - library read models merge both, always preferring explicit user overrides
- Manual-only entries should be stored in the same library identity document family as scan-backed entries so they remain first-class library items.

### Build the library UI around a resolved read model, not raw candidates

- The renderer should not reconstruct library truth from raw scan results.
- Expose backend commands that return:
  - cover-grid ready library cards
  - review queue counts and unresolved reasons
  - a dedicated game detail payload
  - duplicate groups / low-confidence review rows
- The main browse surface should default to resolved games in a cover grid with:
  - title
  - last played timestamp
  - duplicate badge when relevant
  - review badge when relevant
- Keep unresolved duplicate and low-confidence entries out of the main library grid. They belong in a separate review tab / inbox, as required by the phase context.
- The game detail view should be the center of the phase, not an afterthought. It needs to host:
  - identity summary
  - source evidence
  - scan confidence and issue history
  - correction controls
  - launch action and preflight messaging

### Use detail-first navigation, but preserve the current route-registry approach

- The route registry from Phase 1 is still the right top-level shell contract.
- Phase 4 should extend the library feature with detail-capable navigation, for example:
  - `/library`
  - `/library/:gameId`
  - optional query params for `tab=review`
- Do not create a separate app section for review; keep review inside the library domain.
- The library feature should continue using the existing context + reducer provider pattern rather than introducing a new state library.

### Manual add and correction should be lightweight but backend-validated

- Manual add needs only title and executable path, but the backend should still validate:
  - path exists
  - path looks launchable for the supported source shapes
  - path is not already linked to another canonical game unless the user is intentionally resolving a duplicate
- Artwork enrichment should stay deferred or opportunistic. The phase context explicitly does not require manual artwork entry.
- Corrections should happen in the game detail workflow, which implies:
  - the detail payload must be editable
  - save actions should write to the identity overlay, not mutate raw scan evidence
  - review actions should support merge / primary / dismiss / leave flagged outcomes

### Launch preflight must be backend-owned and stricter than the UI

- The renderer can present friendly messaging, but preflight truth should live in Rust.
- Preflight checks should load:
  - Xenia install status from the existing install-state module
  - resolved game identity / path selection from the new library review layer
  - file existence and supported source shape from the filesystem
  - unresolved duplicate / review blockers from the review model
- Separate preflight outcomes into:
  - `blocking` errors: cannot proceed
  - `warning` issues: suspicious but user may continue
  - `ready`: safe to launch
- Blocking cases required by context:
  - Xenia not installed
  - executable path missing
  - file missing on disk
  - unresolved duplicate / review state
  - unsupported source shape
- Warning cases can include:
  - low-confidence identity
  - stale metadata mismatch between candidate and manual override
  - launching from a fallback path that was not scan-verified recently

### Reuse Tauri shell support for process launch and track local session state

- The app already enables `tauri_plugin_shell`, which is the correct seam for spawning the Xenia binary with game arguments.
- Launch should be modeled as a backend command that:
  - runs preflight
  - spawns the emulator process
  - persists session start metadata immediately on success
  - returns a structured launch result to the renderer
- The first version does not need deep process supervision, but it should at least track:
  - `game_id`
  - launched executable path
  - Xenia binary path used
  - launch timestamp
  - session active / completed marker
- `last_played_at` should update as soon as launch begins, matching the user decision in context.
- Phase 4 only needs session tracking far enough to support "running now" state and later played-duration display.

## Planning Implications

### Plan split

The roadmap's three plans should stay distinct:

1. **Library browse and detail experience**
   - resolved read models
   - cover-grid browse surface
   - detail-first navigation
   - review inbox visibility and search/filter/sort controls
2. **Manual add/correction and identity resolution**
   - persisted review / identity overlay
   - manual-only entries
   - duplicate resolution workflows
   - correction forms embedded in detail views
3. **Launch preflight and process spawning**
   - backend preflight contract
   - blocking vs warning outcomes
   - Xenia process launch
   - running-session and last-played updates

### Dependency shape

- Plan `04-01` should run first because it defines the resolved library read model and the user-facing detail shell the later work plugs into.
- Plan `04-02` should depend on `04-01` because correction and review flows belong inside the detail-first library experience rather than inventing an unrelated screen.
- Plan `04-03` should depend on both `04-01` and `04-02` because launch must operate on the resolved game model and enforce the review / duplicate decisions created in the correction workflow.

That yields a clean execution order:
- Wave 1: `04-01`
- Wave 2: `04-02`
- Wave 3: `04-03`

## User Decision Constraints To Preserve

- The default browse experience is a cover grid rather than a plain table.
- Main library cards show title and last played time.
- Duplicate and review flags appear only when relevant.
- Low-confidence and duplicate candidates live in a separate review tab instead of polluting the main grid.
- Selecting a game opens a dedicated detail view first.
- The detail view must expose launch plus management actions from that screen.
- Detail content must show title identity, executable path, source folder, artwork when available, scan confidence/history, and issue notes.
- Review flows need both queue-style progression and sortable-table navigation.
- Duplicate resolution must support all four outcomes:
  - mark one item primary and keep alternates
  - merge into one logical game
  - dismiss false duplicate
  - leave flagged for later
- Manual correction lives inside the detail workflow, not a separate modal-only path.
- Manual add requires only title and executable path.
- Manual corrections override future scan conflicts.
- Launch hard-blocks on invalid prerequisites and warns, rather than blocks, on suspicious-but-launchable cases.
- Successful launch should confirm start, track a running session, and update `last_played_at` immediately.

## Risks And Mitigations

### Risk: Scan rescans overwrite manual decisions

- Mitigation: persist user review / identity overlay separately from raw scan evidence and always apply user overrides last when building resolved game records.

### Risk: The library UI leaks raw candidate ambiguity into the main grid

- Mitigation: expose a backend-resolved browse model for the main library and keep unresolved duplicate / low-confidence work in a separate review inbox.

### Risk: Launch validation drifts between renderer and backend

- Mitigation: centralize preflight classification in Rust and have the renderer render structured `blocking`, `warning`, and `ready` outcomes.

### Risk: Manual add creates entries that later scans duplicate badly

- Mitigation: validate paths against existing candidate links, support merge / primary / dismiss actions, and keep canonical game ids stable regardless of source provenance.

### Risk: Launch starts without enough auditability for supportable UX

- Mitigation: persist launch attempts and session start metadata immediately, reuse the existing install-state and shell seams, and expose launch result details back to the detail view.

## Verification Guidance

- Prefer focused automated checks per plan:
  - `cargo test --manifest-path src-tauri/Cargo.toml library::review`
  - `cargo test --manifest-path src-tauri/Cargo.toml library::identity`
  - `cargo test --manifest-path src-tauri/Cargo.toml library::launch`
  - `npm run test -- --run src/features/library`
  - `npm run test -- --run src/features/dashboard`
  - `npm run build`
- Add Rust tests for:
  - candidate-to-canonical identity merge rules
  - manual override precedence on rescan refresh
  - duplicate resolution outcomes
  - launch preflight classification
  - successful Xenia process spawn argument construction
- Add renderer tests for:
  - cover-grid browse and review inbox rendering
  - detail view navigation
  - inline correction save flows
  - warning vs blocking launch UX
  - last-played and running-session state changes

## Outcome For Planning

Phase 4 should leave the project with a true library-management contract: scan evidence becomes a curated library, users can fix identity mistakes without losing those fixes on the next scan, and games launch through Xenia only after a backend-owned preflight confirms the selected title is actually ready.
