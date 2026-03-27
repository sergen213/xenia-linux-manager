# Codebase Structure

**Analysis Date:** 2026-03-27

## Directory Layout

```
xenialinuxmanager/
├── src/                          # Frontend (TypeScript/React)
│   ├── main.tsx                  # ReactDOM entry point
│   ├── App.tsx                   # Root component — provider nesting + routing
│   ├── app/                      # Application-level config
│   │   ├── router.tsx            # Central route registry (lazy-loaded pages)
│   │   └── router.test.tsx       # Router tests
│   ├── components/               # Shared cross-feature UI
│   │   └── app-shell/            # Layout chrome (sidebar, status bar, shell)
│   ├── features/                 # Feature-sliced modules (domain-driven)
│   │   ├── dashboard/            # Home overview page
│   │   ├── library/              # Game library management (largest feature)
│   │   ├── profiles/             # Per-game configuration profiles
│   │   ├── saves/                # Save file export/import/backup
│   │   ├── settings/             # App settings, paths, release channel
│   │   ├── tasks/                # Background job history + log viewer
│   │   └── xenia/                # Xenia emulator lifecycle (install/update)
│   ├── styles/                   # Global CSS
│   │   └── app.css               # Root styles and CSS variables
│   ├── test-setup.ts             # Vitest setup (testing-library imports)
│   └── vite-env.d.ts             # Vite type declarations
├── src-tauri/                    # Backend (Rust/Tauri 2)
│   ├── src/
│   │   ├── main.rs               # Binary entry — calls lib::run()
│   │   ├── lib.rs                # Tauri builder — plugins, state, command registry
│   │   ├── commands/             # Tauri command handlers (thin delegation layer)
│   │   │   ├── mod.rs            # Module declarations
│   │   │   ├── jobs.rs           # Task history commands
│   │   │   ├── library.rs        # Library source/scan/catalog/launch commands
│   │   │   ├── patches.rs        # Patch deployment + Xenia patch file commands
│   │   │   ├── profiles.rs       # Profile CRUD + materialization commands
│   │   │   ├── release.rs        # Release metadata + updater readiness
│   │   │   ├── saves.rs          # Save export/import/backup commands
│   │   │   ├── settings.rs       # Settings load/save/validate commands
│   │   │   ├── shell.rs          # System open-path command
│   │   │   └── xenia.rs          # Xenia install/update/lifecycle commands
│   │   ├── library/              # Library domain module
│   │   │   ├── mod.rs            # Module declarations
│   │   │   ├── artwork.rs        # Xbox Marketplace cover art fetching
│   │   │   ├── catalog.rs        # Scan result catalog persistence
│   │   │   ├── content.rs        # Game content import/remove
│   │   │   ├── discovery.rs      # Filesystem game discovery
│   │   │   ├── identity.rs       # Game identity CRUD + dedup
│   │   │   ├── launch.rs         # Launch preflight + process spawning
│   │   │   ├── review.rs         # Browse/resolved library views
│   │   │   ├── scan_jobs.rs      # Scan coordination + concurrency
│   │   │   ├── shortcuts.rs      # Linux .desktop file export
│   │   │   ├── sources.rs        # Library source registration
│   │   │   ├── steam.rs          # Steam shortcuts export
│   │   │   └── titleid.rs        # Title ID extraction
│   │   ├── profiles/             # Profile domain module
│   │   │   ├── mod.rs
│   │   │   ├── materialize.rs    # Effective config computation (merge chain)
│   │   │   ├── merge.rs          # Sparse-override merge logic
│   │   │   ├── sources.rs        # Profile source/reference resolution
│   │   │   └── storage.rs        # Profile persistence (JSON on disk)
│   │   ├── saves/                # Save management domain module
│   │   │   ├── mod.rs
│   │   │   ├── archive.rs        # ZIP archive pack/unpack
│   │   │   ├── import.rs         # Import conflict resolution
│   │   │   ├── paths.rs          # Xenia save path resolution
│   │   │   └── storage.rs        # Save backup persistence
│   │   ├── patches/              # Patch management domain module
│   │   │   ├── mod.rs
│   │   │   ├── deploy.rs         # Patch file deployment
│   │   │   ├── parser.rs         # Xenia patch file parsing
│   │   │   ├── storage.rs        # Patch persistence
│   │   │   └── xenia_patches.rs  # Community patch fetch + toggle
│   │   ├── xenia/                # Xenia emulator lifecycle domain module
│   │   │   ├── mod.rs
│   │   │   ├── archive.rs        # Download archive extraction
│   │   │   ├── download.rs       # GitHub release download
│   │   │   ├── install.rs        # Install orchestration
│   │   │   ├── install_state.rs  # Install state detection
│   │   │   ├── lifecycle.rs      # Install/update/retry orchestration
│   │   │   └── releases.rs       # GitHub release fetching
│   │   ├── settings/             # Settings domain module
│   │   │   ├── mod.rs
│   │   │   ├── path_defaults.rs  # Platform path defaults
│   │   │   └── path_validation.rs# Path existence/writability checks
│   │   ├── jobs/                 # Job infrastructure module
│   │   │   ├── mod.rs            # Job types, JobRegistry, lifecycle
│   │   │   ├── events.rs         # Tauri event emitters (job:created/progress/log/completed/failed)
│   │   │   └── store.rs          # Job history persistence
│   │   └── release/              # Release metadata module
│   │       └── mod.rs            # Build info, updater readiness
│   ├── Cargo.toml                # Rust dependencies
│   ├── build.rs                  # Tauri build script
│   ├── tauri.conf.json           # Tauri configuration (window, CSP, bundle)
│   └── icons/                    # App icons (32x32, 128x128, 128x128@2x)
├── scripts/                      # Build/release scripts
│   ├── generate-updater-manifest.mjs
│   └── verify-appimage-release.sh
├── dist/                         # Vite build output (served by Tauri)
├── public/                       # Static assets (copied to dist as-is)
├── docs/                         # Project documentation
├── .planning/                    # GSD planning artifacts
│   └── codebase/                 # Codebase analysis documents
├── index.html                    # Vite HTML entry point
├── package.json                  # Node dependencies + scripts
├── vite.config.ts                # Vite config (React plugin, Tauri port, chunking)
├── tsconfig.json                 # Root TypeScript config
├── tsconfig.app.json             # App TypeScript config
├── tsconfig.node.json            # Node tooling TypeScript config
├── vitest.config.ts              # Vitest test configuration
└── eslint.config.js              # ESLint flat config
```

## Directory Purposes

**`src/`** — Frontend renderer code. Pure TypeScript/React. No filesystem or OS access. Communicates with backend exclusively through Tauri invoke bridge.

**`src/app/`** — Application-level configuration. Contains the central route registry. This is where new top-level routes are registered.

**`src/components/app-shell/`** — Persistent layout chrome shared across all routes. Sidebar navigation, StatusBar (shows Xenia install state + active tasks + build info), and the main content area.

**`src/features/`** — Feature-sliced modules. Each feature is a vertical slice owning its state management, API bridge, types, components, and tests. This is the primary organizational unit.

**`src/styles/`** — Global CSS variables and root styles. Most styling lives in co-located CSS files next to components.

**`src-tauri/src/commands/`** — Tauri command handlers. Thin delegation layer — deserializes arguments, calls domain module functions, returns results. Each file maps 1:1 to a domain module.

**`src-tauri/src/{domain}/`** — Domain modules containing all business logic. Each module owns its data structures, I/O, and persistence. No dependency on Tauri types — pure Rust logic.

**`src-tauri/src/jobs/`** — Cross-cutting job infrastructure. Shared by all domains that need background work (library scans, Xenia installs, patch deployments).

## Key File Locations

**Entry Points:**
- `src/main.tsx`: Frontend entry — creates React root
- `src/App.tsx`: Component tree root — provider nesting + route rendering
- `src-tauri/src/main.rs`: Backend binary entry — calls `lib::run()`
- `src-tauri/src/lib.rs`: Tauri app builder — registers all plugins, state, and ~95 commands

**Configuration:**
- `src-tauri/tauri.conf.json`: Tauri config — window size, CSP, bundle settings
- `vite.config.ts`: Build config — React plugin, dev server port 1420, vendor chunking
- `package.json`: Node scripts (`dev`, `build`, `test`, `lint`, `tauri`)
- `Cargo.toml`: Rust dependencies — Tauri v2, reqwest, tokio, serde, zip

**Core Logic:**
- `src/app/router.tsx`: Route definitions — add new pages here
- `src/features/*/state/*Store.ts`: State management per domain
- `src/features/*/api/*Client.ts`: Tauri invoke bridges per domain
- `src-tauri/src/commands/*.rs`: Command handlers per domain
- `src-tauri/src/{domain}/`: Business logic per domain

**Testing:**
- `src/features/*/__tests__/`: Frontend tests (Vitest + Testing Library)
- `src-tauri/src/{domain}/*.rs`: Backend tests inline via `#[cfg(test)] mod tests`

## Naming Conventions

**Files (Frontend):**
- Pages: `PascalCase` + `Page.tsx` suffix — `LibraryPage.tsx`, `SettingsPage.tsx`
- Components: `PascalCase.tsx` — `XeniaLifecycleCard.tsx`, `ProfileEditorPanel.tsx`
- Stores: `camelCase` + `Store.ts` suffix — `libraryStore.ts`, `settingsStore.ts`
- Providers: `PascalCase` + `Provider.tsx` — `LibraryProvider.tsx`, `SettingsProvider.tsx`
- API clients: `camelCase` + `Client.ts` — `libraryClient.ts`, `settingsClient.ts`
- Types: `camelCase` + `Types.ts` — `libraryTypes.ts`, `taskTypes.ts`
- Hooks: `use` + `PascalCase.ts` — `useLaunchActions.ts`, `useGameDetails.ts`
- CSS: Co-located, same name as component — `XeniaLifecycleCard.css`
- Tests: Component name + `.test.tsx` — `DashboardHome.test.tsx`

**Files (Backend):**
- Modules: `snake_case` — `scan_jobs.rs`, `path_validation.rs`
- Command files: Match domain name — `library.rs`, `xenia.rs`
- `mod.rs` in every module directory for re-exports

**Directories (Frontend):**
- Feature directories: `camelCase` — `library/`, `settings/`, `xenia/`
- Sub-directories: `camelCase` — `components/`, `state/`, `api/`, `model/`, `__tests__/`

**Directories (Backend):**
- All `snake_case` — `commands/`, `library/`, `profiles/`, `jobs/`

## Where to Add New Code

**New Feature (end-to-end vertical slice):**
1. Frontend: Create `src/features/{name}/` with sub-dirs: `state/`, `api/`, `model/`, `components/`, `__tests__/`
2. Frontend: Create `{Name}Page.tsx` in the feature root
3. Frontend: Register route in `src/app/router.tsx` (add to `routes` array)
4. Frontend: Add provider to nesting in `src/App.tsx` (order matters — respect dependency chain)
5. Backend: Create `src-tauri/src/{name}/` module with `mod.rs`
6. Backend: Create `src-tauri/src/commands/{name}.rs` for Tauri command handlers
7. Backend: Register module in `src-tauri/src/lib.rs` (`pub mod {name}`)
8. Backend: Register commands in `lib.rs` `generate_handler![]` macro

**New Component within Existing Feature:**
- Place in `src/features/{feature}/components/` with co-located CSS
- Export from the page or parent component that uses it

**New Tauri Command within Existing Domain:**
1. Add function to `src-tauri/src/commands/{domain}.rs` with `#[tauri::command]`
2. Implement logic in `src-tauri/src/{domain}/{submodule}.rs`
3. Register in `src-tauri/src/lib.rs` `generate_handler![]`

**Utilities:**
- Shared helpers that span features → `src/components/` or `src/app/` (currently minimal — no `utils/` or `lib/` dir exists)
- Shared Rust utilities → appropriate domain module or a new top-level module

## Special Directories

**`dist/`:**
- Purpose: Vite production build output
- Generated: Yes (by `npm run build`)
- Committed: No (in `.gitignore`)

**`public/`:**
- Purpose: Static assets copied to dist as-is (favicon, etc.)
- Generated: No
- Committed: Yes

**`scripts/`:**
- Purpose: Build and release automation
- Contains: `generate-updater-manifest.mjs` (Tauri updater manifest), `verify-appimage-release.sh`
- Generated: No
- Committed: Yes

**`.planning/`:**
- Purpose: GSD planning artifacts — codebase analysis, phase plans, project docs
- Generated: By GSD commands
- Committed: Yes (project management artifacts)

**`src-tauri/icons/`:**
- Purpose: App icons for bundle (32x32, 128x128, 128x128@2x PNG)
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-03-27*
