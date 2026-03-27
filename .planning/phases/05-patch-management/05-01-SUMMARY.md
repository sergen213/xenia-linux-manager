---
phase: 05-patch-management
plan: 01
subsystem: frontend-backend
tags: [rust, tauri, react, patches, storage, remote-fetch]

# Dependency graph
requires:
  - phase: 04-library-review-and-launch-core
    plan: 01
    provides: Backend-owned library detail payloads and canonical game identity records
  - phase: 04-library-review-and-launch-core
    plan: 02
    provides: Persisted identity overlay for stable per-game metadata
provides:
  - Backend patch manifest, source-file storage, and per-entry override persistence under library metadata
  - Local import and community-fetch commands for patch files with replacement confirmation gating
  - Renderer-facing patch inventory contracts wired into the existing library store
affects: [05-02, 06-profiles-and-community-settings]

# Tech tracking
tech-stack:
  added: [toml]
  patterns: [backend-owned patch inventory, immutable source files plus override state, detail-scoped patch contracts]

key-files:
  created:
    - src-tauri/src/patches/mod.rs
    - src-tauri/src/patches/parser.rs
    - src-tauri/src/patches/storage.rs
    - src-tauri/src/patches/sources.rs
    - src-tauri/src/commands/patches.rs
    - src/features/library/model/patchTypes.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/commands/mod.rs
    - src-tauri/src/lib.rs
    - src/features/library/api/libraryClient.ts
    - src/features/library/model/libraryTypes.ts
    - src/features/library/state/libraryStore.ts
    - src/features/library/LibraryPage.tsx

key-decisions:
  - "Patch files now live under library metadata as managed assets instead of inside the replaceable Xenia install directory"
  - "Entry enable or disable state is persisted separately from imported or fetched patch source files"
  - "Community patch replacement is gated behind explicit confirmation before an existing remote-managed file is overwritten"

requirements-completed: [PATC-01, PATC-02]

# Metrics
duration: ~55min
completed: 2026-03-13
---

# Phase 5 Plan 1: Patch Storage, Import, and Community Fetch Contracts

**Patch files can now be imported, fetched into managed storage, and selected independently from the underlying Xenia install**

## Accomplishments

- Added a Rust patch domain that parses `.patch.toml` files, stores them under `library_metadata_path/patches/{game_id}`, and persists active-file plus per-entry override state separately
- Added Tauri patch commands for inventory loading, local import, remote fetch, active-file selection, and entry toggle persistence
- Extended the library client and reducer state so patch inventory is loaded alongside game details instead of being handled by a detached feature

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml patches::storage`
- `cargo test --manifest-path src-tauri/Cargo.toml patches::sources`
- `npm run test -- --run src/features/library/__tests__/libraryStore.test.ts`
- `npm run build`

## Notes

- Community patch lookup is currently matched from the backend game title slug because the library domain still does not expose authoritative title IDs for detected games.
- I did not create per-task commits for this plan because the worktree already contained unrelated uncommitted changes.
