# Feature Research

**Domain:** Linux-native desktop manager for the Xenia Xbox 360 emulator
**Researched:** 2026-03-12
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Guided Xenia install | The stated product promise is easier Linux setup than raw emulator archives | MEDIUM | Must download, verify, extract, and prepare a portable runtime layout. |
| Xenia build update management | Emulator builds change frequently; stale builds cause support noise | MEDIUM | Keep manager updates separate from emulator updates. |
| Game library discovery and launch | A manager without library and launch flow feels incomplete | MEDIUM | Needs recursive scan, manual add fallback, and launch preflight checks. |
| Per-game patch handling | Xenia users already expect patch TOML workflows for Canary | MEDIUM | Must map title IDs/hashes carefully and expose enable/disable UX safely. |
| Per-game configuration profiles | Core value includes avoiding manual config editing per title | MEDIUM | Needs defaults, override merge rules, and visibility into what changed. |
| Save import/export | Users move between setups and want backup/recovery workflows | LOW | Zip-based import/export is enough for v1 if layout is consistent. |
| Clear status/errors | Emulator/patch mismatches are common | LOW | Install, scan, patch, and launch states must surface actionable messages. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Community-optimized settings feed | Reduces trial-and-error per game | MEDIUM | Strong differentiator if profiles are trustworthy and attributable. |
| Linux-first packaging and UX | Makes the app useful where the existing manager is not | MEDIUM | AppImage distribution and Linux-native path handling are part of the product value. |
| Lightweight runtime footprint | Important for emulator users who do not want a heavy launcher always resident | MEDIUM | Influences stack and background-task design. |
| Scan plus manual correction workflow | Makes detection resilient without blocking edge cases | LOW | Better than scan-only or manual-only approaches. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| ROM downloading | Convenience | Legal risk and reputational damage; explicitly out of scope | Focus on library import of user-owned local files only |
| Netplay orchestration on Linux | Users associate Xenia with community netplay | Linux target build does not provide the required path; support burden is high | Leave a future extension point but exclude from v1 |
| Controller remapping suite | Feels like a “complete launcher” feature | Not core to the manager value and duplicates lower-level tools | Document default controller behavior and revisit only if users hit real blockers |
| Cloud sync/accounts | Feels modern | Adds auth, storage, and privacy scope without solving the core local setup problem | Local import/export and filesystem portability |
| “Auto-fix every game” promise | Attractive marketing | Compatibility varies by title, patch, TU, driver, and build | Show recommended settings with provenance and clear caveats |

## Feature Dependencies

```text
Xenia installation/update
    └──requires──> download + extraction pipeline

Library scanning
    └──requires──> game metadata extraction
                       └──enables──> patch/profile matching

Patch management
    └──requires──> per-game identity (title ID / file mapping)

Save import/export
    └──requires──> stable emulator content/save path model

Community profiles
    └──enhances──> per-game configuration profiles

Manager self-update
    ──conflicts with──> naive in-place overwrite during running AppImage session
```

### Dependency Notes

- **Patch management requires per-game identity:** Without reliable game identification, the app cannot safely match TOML patches or optimized settings.
- **Library scanning enables patch/profile matching:** Scan results need enough metadata to connect a local title to community assets.
- **Save import/export requires stable path conventions:** The manager must control or at least normalize emulator directory layout first.
- **Manager self-update conflicts with naive overwrite:** AppImage update/install flow needs a supported updater path rather than ad hoc file replacement.

## MVP Definition

### Launch With (v1)

- [ ] Install and update a Linux Xenia build from the official release artifact — core promise
- [ ] Scan user-selected folders for `.xex` and ISO-backed games with manual add fallback — library usability
- [ ] Launch games with per-game config and patch application — core day-to-day workflow
- [ ] Import/export saves — backup and migration are part of the requested feature set
- [ ] Apply bundled and remote community-optimized settings — requested differentiator tied to setup simplification

### Add After Validation (v1.x)

- [ ] Background folder watching and automatic refresh — add after manual scan flow proves stable
- [ ] Rich artwork/compatibility metadata — add once core launch/install flow is dependable
- [ ] Multiple Xenia channel management beyond Canary-only Linux flow — add if Linux ecosystem expands

### Future Consideration (v2+)

- [ ] Optional online sync for profiles/saves — defer until local-first workflow is solid
- [ ] Plugin-style extension model for extra community integrations — defer until stable internal boundaries exist
- [ ] Deep compatibility reporting and telemetry — defer until privacy and support model are defined

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Guided Xenia install | HIGH | MEDIUM | P1 |
| Xenia update management | HIGH | MEDIUM | P1 |
| Game library discovery | HIGH | MEDIUM | P1 |
| Game launch orchestration | HIGH | MEDIUM | P1 |
| Patch management | HIGH | MEDIUM | P1 |
| Per-game config profiles | HIGH | MEDIUM | P1 |
| Save import/export | MEDIUM | LOW | P1 |
| Community optimized settings feed | HIGH | MEDIUM | P1 |
| Artwork/compatibility enrichment | MEDIUM | MEDIUM | P2 |
| Background library watch | MEDIUM | MEDIUM | P2 |
| Cloud sync | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Competitor A | Competitor B | Our Approach |
|---------|--------------|--------------|--------------|
| Core manager flow | Windows Xenia Manager includes install, update, patches, saves, settings | Raw Xenia Canary releases provide emulator only | Match the manager flow on Linux with Linux-specific packaging and filesystem behavior |
| Patch ecosystem | Xenia Manager integrates Canary patch workflows | Raw patch repo expects manual file handling | Expose patch install/enable flow through game-centric UI |
| Optimized settings | Xenia Manager references a community settings repo | Raw emulator config is manual | Make community profiles first-class but overridable |
| Distribution | Existing manager is Windows-only | Raw Linux release is tar.xz only | Deliver an AppImage manager plus one-click emulator extraction |

## Sources

- `https://github.com/xenia-manager/xenia-manager` — reference feature set
- `https://github.com/xenia-canary/game-patches` — patch workflow expectations and file semantics
- `https://github.com/xenia-manager/optimized-settings` — community settings corpus
- `https://github.com/xenia-canary/xenia-canary-releases/releases` — Linux build distribution model

---
*Feature research for: Linux-native desktop manager for the Xenia Xbox 360 emulator*
*Researched: 2026-03-12*
