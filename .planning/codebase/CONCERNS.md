# Codebase Concerns

**Analysis Date:** 2026-03-27

## Tech Debt

**Root-Level One-Off Python Scripts (Committed to Git):**
- Issue: 18 single-purpose Python patch/fix scripts committed to repository root (`fix_caps.py`, `fix_csp.py`, `fix_fs_perms.py`, `fix_fs_perms_again.py`, `fix_fs_perms_final.py`, `fix_replace.py`, `patch_caps_dialog_fs.py`, `patch_csp.py`, `patch_lib.py`, `patch_lib_dialog.py`, `patch_profiles_materialize.py`, `patch_profiles_merge.py`, `patch_skill.py`, `patch_tauri_conf_scope.py`, `update_artwork.py`, `wipe_artwork.py`, `dump_data.py`, `test_fetch.py`)
- Files: root `*.py` files, `capabilities_test.cjs`, `orchun.txt`
- Impact: Pollutes git history with dead code, confuses contributors, makes repo audit trail noisy. These appear to be throwaway scripts used to modify source files during development. The `orchun.txt` file purpose is unclear.
- Fix approach: Move to a `scripts/tmp/` or `scripts/patches/` directory with a README explaining each, or delete if no longer needed. Add `*.py` at root to `.gitignore` or move scripts into `scripts/`.

**Library Client Is a Thin Pass-Through (730 lines):**
- Issue: `src/features/library/api/libraryClient.ts` is 730 lines of pure pass-through `invoke()` calls with no error handling, retry logic, or caching. Each function wraps a single `invoke()` with a type annotation.
- Files: `src/features/library/api/libraryClient.ts`
- Impact: Any Tauri invoke failure propagates raw to the caller. No centralized error mapping, no timeout handling, no request deduplication. Frontend components must all independently handle errors.
- Fix approach: Add a wrapper `invokeWithHandling()` that catches errors and maps them to user-friendly messages. Consider generated client code from the Rust command signatures.

**Frontend Error Handling is Ad-Hoc:**
- Issue: Frontend has no centralized error boundary or error handling pattern. `console.log`/`console.warn`/`console.error` used as the primary error reporting mechanism (10 instances in production code across `ManagePatchesPanel.tsx`, `LibraryGrid.tsx`, `useLibraryBrowse.ts`). No structured logging or error reporting.
- Files: `src/features/library/components/ManagePatchesPanel.tsx`, `src/features/library/components/LibraryGrid.tsx`, `src/features/library/state/useLibraryBrowse.ts`
- Impact: Errors in production are invisible to users unless explicitly caught in each component. Debug logging (`console.log`) left in `ManagePatchesPanel.tsx` (lines 62, 67, 70, 145) suggests incomplete cleanup.
- Fix approach: Implement a React Error Boundary at the app shell level. Add a centralized error reporting utility. Remove `console.log` debug statements.

**Large Monolithic Components:**
- Issue: `GameDetailsPanel.tsx` (681 lines), `ProfileEditorPanel.tsx` (561 lines), `SettingsPage.tsx` (366 lines), `XeniaLifecycleDialog.tsx` (324 lines) are large single-file components mixing state, effects, and rendering.
- Files: `src/features/library/components/GameDetailsPanel.tsx`, `src/features/library/components/ProfileEditorPanel.tsx`, `src/features/settings/SettingsPage.tsx`
- Impact: Hard to maintain, difficult to test individual pieces, high cognitive load for new contributors.
- Fix approach: Extract sub-components and custom hooks from the largest files. `GameDetailsPanel` at 681 lines is the primary candidate.

**Placeholder Comment in Production Code:**
- Issue: `src-tauri/src/saves/import.rs` line 14 contains `// Placeholder — full implementation in Task 2.` suggesting unfinished work.
- Files: `src-tauri/src/saves/import.rs`
- Impact: If this comment is stale, it's misleading. If it's current, there's incomplete functionality.
- Fix approach: Verify the implementation is complete and remove the comment, or complete the missing functionality.

## Security Considerations

**Shell Command Execution via `open_path`:**
- Risk: `src-tauri/src/commands/shell.rs` uses `std::process::Command` to invoke `xdg-open`/`open`/`explorer` with user-provided paths.
- Files: `src-tauri/src/commands/shell.rs`
- Current mitigation: `ensure_allowed_path()` validates paths against an allowed-roots whitelist using canonicalized path comparison (lines 9-36). Path must exist before opening.
- Recommendations: The current mitigation is solid. Consider adding logging of `open_path` invocations for audit trail. The `allowed_roots` parameter passed from the frontend (`src/features/library/api/libraryClient.ts` line 728) defaults to `[path]` itself, which means any path can be opened if the caller doesn't restrict roots. Review all call sites to ensure restrictive roots are passed.

**Tauri FS Plugin Scope:**
- Risk: The Tauri filesystem plugin (`tauri-plugin-fs`) is enabled with broad capabilities. Generated schemas in `src-tauri/gen/schemas/` show `$HOME`, `$DOWNLOAD`, `$DATA`, `$CONFIG` scopes are available.
- Files: `src-tauri/capabilities/default.json`, `src-tauri/gen/schemas/desktop-schema.json`, `src-tauri/gen/schemas/linux-schema.json`
- Current mitigation: Capability definitions in `default.json` restrict which FS commands are available.
- Recommendations: Audit the capability definitions to ensure only required FS operations are permitted. The `patch_caps_dialog_fs.py` and `fix_fs_perms*.py` scripts suggest the FS permissions were adjusted iteratively - verify the final state is minimal.

**External Network Requests for Artwork and Updates:**
- Risk: `src-tauri/src/library/artwork.rs` downloads images from the network. `src-tauri/src/xenia/releases.rs` fetches GitHub release metadata. `src-tauri/src/xenia/download.rs` downloads binary releases.
- Files: `src-tauri/src/library/artwork.rs`, `src-tauri/src/xenia/releases.rs`, `src-tauri/src/xenia/download.rs`
- Current mitigation: Uses `reqwest` with standard TLS. Downloads are verified after extraction in `archive.rs`.
- Recommendations: Consider pinning certificate verification or adding integrity checks (checksums/signatures) for downloaded Xenia binaries. Current `validate_extracted_layout()` checks executable permissions but not binary integrity.

## Performance Bottlenecks

**Synchronous Mutex Locking in Scan Coordinator:**
- Problem: `src-tauri/src/library/scan_jobs.rs` uses `std::sync::Mutex` with `.lock().unwrap()` in 14 locations in production code paths (lines 95, 116, 123, 134, 140, 145, 151).
- Files: `src-tauri/src/library/scan_jobs.rs`
- Cause: `std::sync::Mutex` will panic if poisoned. Any panic during scan processing poisons the mutex and crashes the app.
- Improvement path: Replace `.unwrap()` with `.lock().map_err(...)` or use `tokio::sync::Mutex` for async contexts. Add mutex poisoning recovery.

**Same Pattern in Job Registry:**
- Problem: `src-tauri/src/jobs/mod.rs` uses `self.jobs.lock().unwrap()` in 6 production locations (lines 151, 157, 162, 170, 181, 186, 192).
- Files: `src-tauri/src/jobs/mod.rs`
- Cause: Same mutex poisoning risk as scan coordinator.
- Improvement path: Same fix - handle lock poisoning gracefully.

**Frontend Artwork Fetch is Unbatched:**
- Problem: `useLibraryBrowse.ts` fetches artwork with `fetchAllArtwork(libPath)` which fires a single backend command, but the results trigger a full `refreshLibrary()` on each batch completion (line 99).
- Files: `src/features/library/state/useLibraryBrowse.ts`
- Cause: Each artwork download batch causes a full library re-browse, re-rendering the entire grid.
- Improvement path: Only refresh the specific game cards whose artwork changed, or use event-based updates instead of polling.

## Fragile Areas

**Large Rust Files with Complex Logic:**
- Files: `src-tauri/src/saves/import.rs` (898 lines), `src-tauri/src/profiles/storage.rs` (808 lines), `src-tauri/src/library/steam.rs` (765 lines), `src-tauri/src/commands/xenia.rs` (713 lines)
- Why fragile: Large files with complex state management are prone to regression during refactoring. The import pipeline in `import.rs` has a multi-step staged workflow that is order-dependent.
- Safe modification: Preserve the import pipeline stages (inspect -> plan -> backup -> apply). Add integration tests before modifying `steam.rs` VDF parsing.

**VDF Binary Parsing in Steam Integration:**
- Files: `src-tauri/src/library/steam.rs`
- Why fragile: Custom binary VDF parser handles Steam's proprietary format. Any Valve format change would break this. The `parse_shortcuts_vdf()` function has manual offset tracking.
- Safe modification: Add more test fixtures with different VDF versions. Consider using a well-maintained VDF parsing library instead of hand-rolled parsing.

**Profile Merge and Materialization Chain:**
- Files: `src-tauri/src/profiles/merge.rs`, `src-tauri/src/profiles/materialize.rs`, `src-tauri/src/profiles/storage.rs`
- Why fragile: The profile system has multiple layers: storage -> merge -> materialize -> launch. Changes to one layer can cascade. Shared profiles across games (line 231 in merge.rs tests) add complexity.
- Safe modification: Always test the full profile lifecycle when changing any profile-related code. The test suite in `merge.rs` is comprehensive (20+ tests).

## Test Coverage Gaps

**No Rust Test Coverage Tooling:**
- What's not tested: No `cargo-tarpaulin` or similar coverage tool configured. While individual modules have unit tests, there's no visibility into overall coverage.
- Risk: Unknown blind spots in coverage.
- Priority: Medium
- Fix approach: Add `cargo-tarpaulin` to CI and set a coverage threshold.

**No Frontend Integration/E2E Tests:**
- What's not tested: All 24 test files are unit tests using Vitest + Testing Library. No E2E tests exist for the Tauri desktop app. The app launches Xenia, manages file operations, and handles real filesystem paths - none of which are tested end-to-end.
- Files: `src/features/**/__tests__/*.test.{ts,tsx}`
- Risk: Tauri invoke/Rust integration is untested from the frontend perspective. Race conditions in scan/artwork loading are invisible.
- Priority: High
- Fix approach: Add at least one Playwright test that exercises the Tauri app through a full game import workflow.

**Rust Test `unwrap()` Usage (Not a Production Concern):**
- What's not tested: All 409 `.unwrap()` calls in the Rust codebase are in `#[cfg(test)]` blocks or are safe (e.g., `candidates.into_iter().next().unwrap()` on line 134 of `saves/paths.rs` where length is verified to be 1 on line 133).
- Files: All `*-test.rs` and `#[cfg(test)]` modules
- Risk: None for production. Tests use `.unwrap()` which will panic on assertion failure, which is the correct behavior for tests.

**Frontend `invoke()` Calls Lack Error Boundaries:**
- What's not tested: `libraryClient.ts` has 50+ `invoke()` calls with no error wrapping. If a Tauri command fails, the raw error string propagates to the component.
- Files: `src/features/library/api/libraryClient.ts`
- Risk: Unhandled Tauri errors could crash React renders or leave UI in inconsistent state.
- Priority: High

## Scaling Limits

**JSON File-Based Storage:**
- Current capacity: All data (library identity, profiles, catalogs, settings, job history) stored as JSON files on disk.
- Limit: Performance degrades as library grows. `browseLibrary()` loads entire identity store into memory. `load_identity_store()` reads and parses the full JSON file on every call.
- Scaling path: For game libraries exceeding ~1000 entries, consider SQLite or an indexed store. Currently acceptable for typical use (10-100 games).

**Scan Coordinator is Single-Threaded Queue:**
- Current capacity: Processes one scan at a time via `active`/`queue` tracking in `ScanCoordinator`.
- Limit: Large multi-source libraries are scanned sequentially.
- Scaling path: The current design is intentional (avoids disk I/O contention). No action needed unless users report slow scan times with many sources.

## Dependencies at Risk

**`tauri-plugin-fs` 2.4.5 / `tauri-plugin-dialog` 2.6.0:**
- Risk: Pinned to specific minor versions while other Tauri plugins use `^2` ranges. Inconsistent versioning strategy.
- Impact: May miss security patches in newer minor versions, or create version conflicts.
- Migration plan: Align all Tauri plugin version specifications to use caret ranges (`^2.4.5`) or pin all consistently.

**`reqwest` 0.12 with streaming:**
- Risk: Large dependency with many features enabled (`json`, `stream`). Only needed for Xenia release downloads and artwork fetching.
- Impact: Increases binary size and compile times.
- Migration plan: Consider using a lighter HTTP client (e.g., `ureq`) for simple GET requests, keeping `reqwest` only for streaming downloads.

## Missing Critical Features

**No Application Logging Framework:**
- Problem: The frontend uses raw `console.log/warn/error`. The Rust backend uses `Result<_, String>` error types with no structured logging.
- Blocks: Production debugging, user bug reporting, performance monitoring.
- Fix approach: Add `tracing` crate for Rust backend logging. Add a lightweight frontend logger that can be toggled via settings.

**No Crash Recovery / State Repair:**
- Problem: If the app crashes mid-operation (scan, install, import), the JSON state files may be in an inconsistent state. `jobs/store.rs` has `recover_interrupted_jobs()` but other stores don't have equivalent recovery.
- Blocks: Data integrity after crashes.
- Fix approach: Add state validation and repair on startup for all JSON stores.

---

*Concerns audit: 2026-03-27*
