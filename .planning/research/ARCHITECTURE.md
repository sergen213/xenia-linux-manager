# Architecture Research

**Domain:** Linux-native desktop manager for the Xenia Xbox 360 emulator
**Researched:** 2026-03-12
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```text
┌──────────────────────────────────────────────────────────────┐
│                         Presentation                         │
├──────────────────────────────────────────────────────────────┤
│  React screens: Library | Xenia Manager | Game Detail       │
│  Patch/Profile Editor | Save Tools | Settings               │
└───────────────┬───────────────────────────────┬──────────────┘
                │ Tauri commands/events         │
┌───────────────▼───────────────────────────────▼──────────────┐
│                        Application Core                      │
├──────────────────────────────────────────────────────────────┤
│ Install Service | Update Service | Library Scanner          │
│ Game Identity Resolver | Patch Service | Profile Service    │
│ Save Service | Launch Service | Settings Service            │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
┌───────────────▼──────────────┐   ┌────────────▼──────────────┐
│          Persistence         │   │       External Assets     │
├──────────────────────────────┤   ├───────────────────────────┤
│ SQLite metadata store        │   │ Xenia release artifact    │
│ Local config/profile JSON    │   │ Patch repositories        │
│ Logs + cache                 │   │ Optimized settings feeds  │
└──────────────────────────────┘   └───────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Presentation layer | Render library, install/update, patch/profile, and save-management UX | React routes/views plus local state and async queries |
| Application services | Own business rules and orchestrate downloads, extraction, scans, patch/profile application, and launching | Rust modules exposed through Tauri commands/events |
| Persistence layer | Store indexed game/library/profile state and app settings | SQLite for relational metadata plus filesystem-backed artifacts |
| Integration adapters | Talk to release feeds, patch/settings repos, and local Xenia process | HTTP clients, archive extractors, process spawning, filesystem readers |

## Recommended Project Structure

```text
src/
├── app/                    # App shell, routing, startup wiring
├── features/
│   ├── library/            # Library list, scan flows, game detail UI
│   ├── xenia/              # Install/update/manage Xenia UI
│   ├── patches/            # Patch discovery, enable/disable, source status
│   ├── profiles/           # Per-game settings and community profile UX
│   ├── saves/              # Import/export/delete save flows
│   └── settings/           # App settings and folder preferences
├── shared/                 # Design primitives, typed API bindings, utils
└── tests/                  # Frontend-focused tests

src-tauri/
├── src/
│   ├── commands/           # Tauri command entrypoints
│   ├── services/           # Install/update/scan/launch/save orchestration
│   ├── domain/             # Game identity, patch, profile, save models
│   ├── infra/
│   │   ├── db/             # SQLite access
│   │   ├── fs/             # Path handling, scanning, archive extraction
│   │   ├── http/           # Release/feed clients
│   │   └── process/        # Xenia launch and process observation
│   └── main.rs             # App bootstrap and plugin setup
└── capabilities/           # Tauri capability configuration
```

### Structure Rationale

- **`features/` in the frontend:** Keeps UI grouped by user workflow instead of by technical primitive.
- **`commands/ -> services/ -> infra/` in Rust:** Separates Tauri IPC from actual app logic, making backend behavior testable without the desktop shell.
- **`domain/` models:** Prevents patch, profile, save, and game-identity rules from being scattered through UI handlers.

## Architectural Patterns

### Pattern 1: Thin IPC Boundary

**What:** Tauri commands should validate input, call one backend service, and return typed results.
**When to use:** Always for install/update/scan/launch/save flows.
**Trade-offs:** Slightly more boilerplate, but far easier to test and evolve than embedding logic in command handlers.

**Example:**
```typescript
// frontend
await invoke("scan_library", { roots, followSymlinks: false });
```

### Pattern 2: Local-First Source of Truth

**What:** Treat local filesystem state plus SQLite metadata as the system of record; online feeds enrich but do not own the user’s library.
**When to use:** Library, saves, installed emulator, local profiles.
**Trade-offs:** Requires careful reconciliation logic when feeds change, but keeps the app useful offline.

### Pattern 3: Artifact Separation

**What:** Store manager data, emulator payloads, saves, patches, and caches in clearly separated directories.
**When to use:** From phase 1 onward.
**Trade-offs:** Slightly more path-management code, but much better recovery and import/export behavior.

## Data Flow

### Request Flow

```text
[User clicks "Install Xenia"]
    ↓
[React install screen]
    ↓
[Tauri command]
    ↓
[Install service]
    ↓
[HTTP download -> tar.xz extraction -> post-install setup]
    ↓
[SQLite/settings update + progress events]
    ↓
[Frontend status update]
```

### State Management

```text
[SQLite + filesystem]
    ↓
[Rust service query]
    ↓
[Tauri command result]
    ↓
[React Query cache / local UI state]
    ↓
[Rendered screens]
```

### Key Data Flows

1. **Install/update flow:** Release metadata -> artifact download -> extraction -> portable layout prep -> persisted installed-build metadata.
2. **Library scan flow:** User-selected roots -> recursive scan -> identity resolution for `.xex`/ISO candidates -> SQLite upsert -> library refresh.
3. **Patch/profile flow:** Selected game -> title/media/hash lookup -> local/bundled/remote asset resolution -> merge/apply -> launch preflight.
4. **Save flow:** Selected game -> normalized save path -> zip import/export -> verification -> status surfaced in UI.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k local games | Single SQLite file and direct filesystem scan are fine |
| Large multi-folder libraries | Add scan index caching, incremental rescans, and background job queue |
| Heavy community metadata expansion | Cache remote feeds locally and separate immutable feed snapshots from user overrides |

### Scaling Priorities

1. **First bottleneck:** Recursive scanning over large storage volumes; fix with incremental indexing and deferred deep inspection.
2. **Second bottleneck:** UI responsiveness during long-running install/scan jobs; fix with backend event streams and cancellable tasks.

## Anti-Patterns

### Anti-Pattern 1: UI-Centric Business Logic

**What people do:** Put patch/profile/launch rules in React components.
**Why it's wrong:** Hard to test, duplicates logic, and breaks when adding CLI/background flows later.
**Do this instead:** Keep workflow rules in Rust services and expose typed results to the UI.

### Anti-Pattern 2: Treating All Game Files as Equivalent

**What people do:** Scan by filename extension and call it done.
**Why it's wrong:** Leads to wrong patch matches, duplicate entries, and brittle save/profile mapping.
**Do this instead:** Separate discovery from identity resolution and preserve confidence/override state.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Xenia Canary releases | Poll GitHub release metadata or pinned artifact URL | Manager must handle download/extract failures and partial installs cleanly. |
| Patch repositories | Fetch repo index/archive, cache locally, apply per title | Patch support depends on title/hash/version compatibility. |
| Optimized settings repository | Fetch per-title settings JSON | Keep provenance and allow local override. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Frontend ↔ backend | Tauri command/event API | Keep payloads typed and versioned. |
| Services ↔ persistence | Repository-style Rust interfaces | Prevent SQL/path logic from leaking upward. |
| Services ↔ external feeds | Adapter modules | Makes offline fallback and test doubles possible. |

## Sources

- `https://github.com/xenia-manager/xenia-manager` — reference component set and user workflows
- `https://github.com/xenia-canary/game-patches` — patch application model
- `/websites/v2_tauri_app` — bundle/updater capabilities for the desktop shell
- `https://docs.appimage.org/` — AppImage packaging/distribution constraints

---
*Architecture research for: Linux-native desktop manager for the Xenia Xbox 360 emulator*
*Researched: 2026-03-12*
