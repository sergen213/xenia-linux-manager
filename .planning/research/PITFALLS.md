# Pitfalls Research

**Domain:** Linux-native desktop manager for the Xenia Xbox 360 emulator
**Researched:** 2026-03-12
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Wrong Game Identity Mapping

**What goes wrong:**
Patches, optimized settings, saves, or launch options get applied to the wrong title or duplicate entries appear for the same game.

**Why it happens:**
Developers rely on folder names or shallow extension matching instead of stable title/hash metadata and explicit override paths.

**How to avoid:**
Separate discovery from identity resolution, store confidence/state for each match, and allow manual correction when detection is ambiguous.

**Warning signs:**
Games appear multiple times, patch lookup misses obvious titles, or users must rename files to make the app work.

**Phase to address:**
Phase 2

---

### Pitfall 2: Brittle Install/Update Recovery

**What goes wrong:**
An interrupted download or failed extraction leaves the emulator in a half-installed state and the manager cannot recover automatically.

**Why it happens:**
Install/update logic overwrites live directories in place without staging, validation, or rollback markers.

**How to avoid:**
Download to a staging location, validate the archive/extraction result, then atomically promote the new install and retain rollback metadata.

**Warning signs:**
Support reports about missing executables, broken config directories, or update loops after a failed install.

**Phase to address:**
Phase 1

---

### Pitfall 3: AppImage Self-Update Assumptions

**What goes wrong:**
The manager “update” feature breaks on Linux because the running AppImage cannot just overwrite itself with an arbitrary file operation.

**Why it happens:**
Developers assume Windows-style in-place replacement instead of using the supported AppImage/Tauri update path.

**How to avoid:**
Use the Tauri updater plugin for the manager itself and keep emulator-binary updates as a separate workflow.

**Warning signs:**
Design discussions mix “update the manager” with “update Xenia,” or implementation reaches for raw overwrite scripts.

**Phase to address:**
Phase 1

---

### Pitfall 4: Blocking UI During Heavy Local Operations

**What goes wrong:**
The app freezes while downloading, extracting, scanning, or zipping saves, making it feel unreliable.

**Why it happens:**
Long-running filesystem and network tasks are executed on the UI thread or through synchronous command handlers.

**How to avoid:**
Run install/scan/import/export work in async backend jobs and stream progress/status events back to the UI.

**Warning signs:**
Spinner-only UX with no progress details, or reports that the app “hangs” on large folders.

**Phase to address:**
Phase 1

---

### Pitfall 5: Unsafe Remote Asset Trust

**What goes wrong:**
Broken or malicious remote patch/profile content corrupts local config or produces hard-to-debug launch failures.

**Why it happens:**
Community assets are fetched and applied without schema validation, provenance tracking, or user visibility.

**How to avoid:**
Validate remote data strictly, cache source metadata, and surface what source/version is being applied to each game.

**Warning signs:**
Users cannot tell where a profile came from, or a feed change silently alters launch behavior.

**Phase to address:**
Phase 3

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store all library data in one JSON file | Fast prototype | Painful indexing, migration, and conflict handling | Only for an early throwaway prototype |
| Hardcode paths for one distro layout | Faster initial coding | Breaks across Linux environments and packaging modes | Never |
| Merge manager and emulator update logic | Simpler mental model | Recovery bugs and unclear ownership of failures | Never |
| Parse only top-level folders during scans | Faster MVP | Missed titles and poor user trust | Acceptable only if paired with an explicit “deep scan later” design |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Xenia release downloads | Assuming a single stable file layout forever | Treat release artifact shape as external input and validate extracted contents |
| Patch repository | Assuming title name alone is enough for matching | Use title ID/hash/media-aware matching with manual overrides |
| Optimized settings feed | Applying remote settings as opaque text | Validate against a known schema and keep local override precedence |
| AppImage distribution | Shipping an AppImage without update metadata or desktop integration assets | Include proper AppImage metadata and supported update configuration |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full deep rescan on every launch | Slow startup and high disk churn | Cache scan state and do incremental refresh | Large libraries or external drives |
| Reading full ISO contents just to list candidates | High I/O cost and long scan times | Use lightweight detection first, deep inspect only when needed | Moderate-to-large game collections |
| Rebuilding all derived game metadata on every UI change | Sluggish library interactions | Persist normalized metadata and update incrementally | Once library size grows beyond a small test set |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting imported archives blindly | Zip-slip/path traversal or destructive overwrite | Validate archive entry paths and extract into controlled destinations |
| Launching arbitrary paths with shell interpolation | Command injection or wrong process execution | Spawn executables with explicit arguments and validated paths |
| Writing remote content directly into active config | Corrupt or malicious config state | Validate, preview, then apply through controlled write paths |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Hiding where files are stored | Users cannot debug or back up their setup | Show effective paths for emulator, saves, patches, and profiles |
| Generic “launch failed” messaging | Users do not know whether the issue is game, patch, config, or emulator build | Surface concrete preflight failures and suggested next steps |
| Implicit destructive actions on saves/profiles | Users lose data trust immediately | Require confirmation and provide export/backup paths first |

## "Looks Done But Isn't" Checklist

- [ ] **Install flow:** Often missing partial-failure cleanup — verify interrupted downloads/extractions recover cleanly
- [ ] **Library scan:** Often missing manual correction path — verify users can fix ambiguous detections
- [ ] **Patch support:** Often missing version/hash mismatch visibility — verify users can tell why a patch did not apply
- [ ] **Save import/export:** Often missing overwrite conflict handling — verify collisions are surfaced before destructive writes
- [ ] **Updater:** Often missing distinction between manager updates and emulator updates — verify each flow is independently testable

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong identity mapping | MEDIUM | Re-index the title, preserve user override, refresh patch/profile resolution |
| Failed install/update | MEDIUM | Remove staged install, restore prior known-good metadata, prompt retry |
| Corrupt remote profile/patch application | LOW | Revert from cached last-known-good local copy and disable remote asset |
| Broken AppImage update path | HIGH | Ship fixed updater config and provide manual download fallback |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Brittle install/update recovery | Phase 1 | Interrupted install and failed extraction tests recover to a valid state |
| AppImage self-update assumptions | Phase 1 | Manager update path is separate from Xenia update path and documented in tests |
| Blocking UI during heavy operations | Phase 1 | Large installs/scans emit progress and keep UI responsive |
| Wrong game identity mapping | Phase 2 | Ambiguous titles can be corrected and duplicate detection is tested |
| Unsafe remote asset trust | Phase 3 | Remote profiles/patches are schema-validated and provenance is visible |

## Sources

- `https://github.com/xenia-manager/xenia-manager` — reference workflow and structure
- `https://github.com/xenia-canary/game-patches` — patch matching/usage pitfalls
- `https://docs.appimage.org/packaging-guide/distribution.html` — AppImage update/distribution constraints
- `/websites/v2_tauri_app` — supported updater integration path

---
*Pitfalls research for: Linux-native desktop manager for the Xenia Xbox 360 emulator*
*Researched: 2026-03-12*
