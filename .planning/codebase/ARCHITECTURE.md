# Architecture

**Analysis Date:** 2026-03-27

## Pattern Overview

**Overall:** Tauri 2 Desktop Application — two-process architecture (Rust backend + React frontend) with IPC bridge

**Key Characteristics:**
- Rust backend owns all I/O, persistence, and OS interaction; frontend is a pure renderer
- Communication exclusively through Tauri's `invoke` bridge (frontend → backend) and Tauri events (backend → frontend)
- Feature-sliced frontend with each feature owning its state, API client, types, and components
- Context + Reducer state management per domain — no external state library (no Redux, Zustand, etc.)
- All long-running operations (scans, installs, updates) run as background jobs with progress events

## Layers

### Frontend Layer (TypeScript/React)

**Purpose:** UI rendering and user interaction — no filesystem or OS access
**Location:** `src/`
**Contains:** React components, Context providers, Reducer stores, Tauri invoke bridges, TypeScript type definitions
**Depends on:** `@tauri-apps/api` (for IPC), `react`, `react-router-dom`
**Used by:** Tauri webview runtime

Sub-layers within the frontend:

- **App Shell** (`src/components/app-shell/`): Persistent layout — Sidebar navigation + StatusBar + content slot
- **Feature Modules** (`src/features/{domain}/`): Self-contained vertical slices per business domain
- **Router** (`src/app/router.tsx`): Central route registry with lazy-loaded page components
- **Global Styles** (`src/styles/app.css`): Root CSS

### Backend Layer (Rust/Tauri)

**Purpose:** All business logic, filesystem operations, HTTP requests, process management, persistence
**Location:** `src-tauri/src/`
**Contains:** Domain modules, Tauri command handlers, job orchestration, file I/O, process spawning
**Depends on:** `tauri` (v2), `reqwest`, `tokio`, `serde`, `zip`
**Used by:** Tauri runtime (dispatches commands from frontend)

Sub-layers within the backend:

- **Commands** (`src-tauri/src/commands/`): Thin Tauri command handlers — deserialize args, delegate to domain modules
- **Domain Modules** (`src-tauri/src/{library,profiles,saves,patches,xenia,settings,jobs,release}/`): All business logic
- **Jobs** (`src-tauri/src/jobs/`): Shared job lifecycle infrastructure (register, track, persist, emit events)

## Data Flow

### Frontend → Backend (Command Invocation)

1. UI component calls action hook (e.g., `useLaunchActions`)
2. Action hook calls API client function (e.g., `libraryClient.launchLibraryGame()`)
3. API client calls `invoke("launch_library_game", { ... })` from `@tauri-apps/api/core`
4. Tauri runtime deserializes args and dispatches to matching `#[tauri::command]` function in `src-tauri/src/commands/`
5. Command handler delegates to domain module (e.g., `launch::launch_game()`)
6. Result serializes back through the bridge to the API client promise

### Backend → Frontend (Event Streaming)

1. Background job (e.g., scan, install) emits event via `events::emit_job_progress()`
2. Tauri runtime broadcasts named event (`job:progress`, `job:log`, `job:completed`, `job:failed`)
3. `TasksProvider` subscribes to events on mount using `@tauri-apps/api/event`
4. Event callbacks dispatch actions to `tasksReducer`, updating `TasksState`
5. Components consuming `useTasks()` re-render with live job updates

### State Management Flow

1. Provider mounts at app root → calls API client on mount (e.g., `loadSettings()`)
2. Success response dispatched to reducer → state populated
3. Components read state via context hook (e.g., `useSettings()`)
4. User actions → dispatch action → reducer updates state → re-render

## Key Abstractions

**Feature Module Pattern:**
Every feature domain follows the same structure:
- `state/{domain}Store.ts` — Context, reducer, state shape, action types, selector functions
- `state/{Domain}Provider.tsx` — Mounts reducer, loads initial data, provides context
- `api/{domain}Client.ts` — Tauri invoke bridge functions (1:1 with Rust commands)
- `model/{domain}Types.ts` — TypeScript interfaces mirroring Rust structs
- `components/` — UI components consuming the store
- `{Domain}Page.tsx` — Top-level route page
- `__tests__/` — Component and store tests

**Job System (`src-tauri/src/jobs/`):**
Generic infrastructure for any long-running backend operation. Jobs have a lifecycle (Running → Completed | Failed | Interrupted) with step-by-step log entries and progress percentage. The `JobRegistry` is a thread-safe in-memory store shared via Tauri state management (`Arc<JobRegistry>`). Events bridge job state changes to the frontend in real-time.

**Settings as Gatekeeper:**
Settings load first (outermost Provider). The `AppContent` component gates the entire UI — `FirstRunSetup` renders until `setup_complete` is true. All other providers depend on `settings.app_data_path` and `settings.library_metadata_path` to initialize.

**Profile Materialization:**
Profiles use a sparse-override merge model. `profiles::materialize` computes the effective launch config by merging base defaults + profile overrides. The frontend consumes this via `get_materialized_launch_config` command.

## Entry Points

**Frontend Entry:**
- `src/main.tsx`: ReactDOM root — mounts `<BrowserRouter><App /></BrowserRouter>`
- `src/App.tsx`: Provider nesting → `AppContent` (gates on setup) → `MainShell` (AppShell + Routes)

**Backend Entry:**
- `src-tauri/src/main.rs`: Calls `xenia_linux_manager_lib::run()`
- `src-tauri/src/lib.rs`: Builds Tauri app — registers plugins, shared state, and ~95 command handlers

**Route Entry Points:**
- `/` → `DashboardHome` (Xenia lifecycle card, library summary, active tasks)
- `/library` → `LibraryPage` (game grid, sources, details panel, patches, profiles)
- `/saves` → `SavesPage` (save export/import/backup management)
- `/tasks` → `TasksPage` (job history, log viewer)
- `/settings` → `SettingsPage` (paths, release channel, first-run config)

**Shared State Managed by Tauri:**
- `Arc<JobRegistry>` — In-memory job tracking
- `Arc<ScanCoordinator>` — Library scan orchestration and concurrency control

## Error Handling

**Strategy:** Result-based on both sides

**Backend (Rust):**
- Domain functions return `Result<T, String>` — errors are string messages propagated through Tauri's invoke bridge
- `thiserror` used for domain-specific error types in some modules
- Jobs track errors in `job.error` field and emit `job:failed` events

**Frontend (TypeScript):**
- API client calls are awaited; errors caught by action hooks
- Reducer stores track `error: string | null` and `loading: boolean` fields
- Providers use try/catch with fallback to default state when Tauri runtime unavailable (dev mode)
- UI shows loading spinners during async operations, error messages on failure

## Cross-Cutting Concerns

**Logging:** No structured logging framework on either side. Backend uses `JobLogEntry` with Info/Warn/Error levels for job-scoped logs only. Frontend has no logging.
**Validation:** Settings paths validated on backend via `settings::path_validation`. Validation results returned to frontend as `SettingsValidation` struct.
**Authentication:** Not applicable — local desktop app with no user accounts.
**Persistence:** File-based — JSON for settings, library metadata, job history, profiles. TOML for some config. No database.

---

*Architecture analysis: 2026-03-27*
