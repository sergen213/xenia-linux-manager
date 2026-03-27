# Coding Conventions

**Analysis Date:** 2026-03-27

## Naming Patterns

**Files:**
- PascalCase for components and pages: `Sidebar.tsx`, `DashboardHome.tsx`, `SettingsPage.tsx`
- camelCase for non-component modules: `settingsStore.ts`, `libraryClient.ts`, `taskTypes.ts`
- CSS co-located with component, same name: `Sidebar.tsx` → `Sidebar.css`
- Test files use `.test.tsx`/`.test.ts` suffix, placed in `__tests__/` subdirectories
- Model files: plural noun + `Types.ts` or `Schema.ts` — `libraryTypes.ts`, `settingsSchema.ts`, `taskTypes.ts`

**Directories (feature-based):**
```
src/features/{feature}/
├── api/           # Tauri invoke clients (camelCase: libraryClient.ts)
├── components/    # UI components (PascalCase: ProfileEditorPanel.tsx)
├── model/         # TypeScript interfaces/types (camelCase: libraryTypes.ts)
├── state/         # Store + Provider (camelCase: libraryStore.ts, LibraryProvider.tsx)
└── __tests__/     # Test files co-located within feature
```

**Functions:**
- camelCase: `loadSettings()`, `getSidebarRoutes()`, `selectRunningJobs()`
- Exported async functions in API clients: `addLibrarySource()`, `launchLibraryGame()`
- React components: PascalCase function declarations — `export function Sidebar()`
- Custom hooks: `use` prefix — `useSettings()`, `useRouteRestore()`
- Selectors: `select` prefix — `selectPrimaryAction()`, `selectInstalledTag()`, `selectTaskSummary()`

**Variables:**
- camelCase for local variables and function parameters
- UPPER_SNAKE_CASE for constants only: `INITIAL_STATE`, `INITIAL_LIBRARY_STATE`, `PATH_FIELDS`
- Interface/type names: PascalCase — `SettingsState`, `LibrarySource`, `AppSettings`

**Types:**
- Interfaces for data shapes mirroring Rust structs: `AppSettings`, `LibrarySource`, `Job`
- Type aliases for unions/narrows: `SettingsAction`, `LibraryAction`, `Confidence = "high" | "medium" | "low"`
- Discriminated unions for actions: `{ type: "LOAD_START" } | { type: "LOAD_SUCCESS"; settings: AppSettings; ... }`

## Code Style

**Formatting:**
- No explicit Prettier or formatter config detected — formatting is enforced by ESLint + TypeScript strict mode
- Double quotes for all string literals (`"react"`, `"LOAD_START"`)
- Trailing semicolons everywhere
- 2-space indentation throughout

**Linting:**
- ESLint 9 flat config (`eslint.config.js`) using `typescript-eslint` recommended
- React hooks linting via `eslint-plugin-react-hooks`
- React Refresh linting via `eslint-plugin-react-refresh` (Vite HMR safe)
- `dist/` directory globally ignored

**TypeScript:**
- Target: ES2023, JSX: react-jsx (automatic runtime)
- `strict: true` with additional checks: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly`, `noUncheckedSideEffectImports`
- `verbatimModuleSyntax: true` — requires explicit `import type` for type-only imports
- `moduleResolution: "bundler"` with `allowImportingTsExtensions`
- Path aliases: Not used — all imports use relative paths (`../../features/settings/state/settingsStore`)

## Import Organization

**Order:**
1. React / React DOM
2. Third-party libraries (`react-router-dom`, `@tauri-apps/api/core`)
3. Local imports from other features (using relative paths)
4. Local imports from same feature
5. CSS files (always last): `./Sidebar.css`, `../model/settingsSchema.ts`

**Pattern for type-only imports:**
```typescript
import type { ReactNode } from "react";
import type { AppSettings, SettingsValidation } from "../model/settingsSchema";
```

**Separation of concerns in imports:**
```typescript
// Runtime values
import { createContext, useContext } from "react";
// Type-only
import type { AppSettings } from "../model/settingsSchema";
```

## Error Handling

**Reducer pattern (primary):**
- Every feature store has `LOAD_ERROR`, `SAVE_ERROR` actions storing error as `string | null`
- Reducers set `loading: false, error: action.error` on error
- `CLEAR_ERROR` action to reset error state
- Error stored in state, displayed reactively by components

**Provider-level error handling:**
```typescript
// From SettingsProvider.tsx — graceful fallback pattern
try {
  const [settings, validation] = await loadSettings();
  if (!cancelled) {
    dispatch({ type: "LOAD_SUCCESS", settings, validation });
  }
} catch {
  // Fallback to defaults if Tauri invoke fails
  try {
    const defaults = await getDefaultSettings();
    // ...
  } catch (innerErr) {
    dispatch({
      type: "LOAD_ERROR",
      error: innerErr instanceof Error ? innerErr.message : String(innerErr),
    });
  }
}
```

**Async cleanup pattern:**
- All async effects use `let cancelled = false` pattern with cleanup function returning `() => { cancelled = true; }`
- Guard `if (!cancelled)` before dispatching after await

**API client layer:**
- Thin wrappers around `invoke<TauriCommand>()` — errors propagate as rejected promises
- No try/catch in API clients — callers (providers/components) handle errors
- Functions return typed promises: `Promise<AppSettings>`, `Promise<SettingsValidation>`

## Logging

**Framework:** No logging framework — `console` not used in production code paths.

**Patterns:**
- Errors captured in state, not logged to console
- No structured logging detected

## Comments

**When to Comment:**
- JSDoc-style block comments on exported functions and interfaces in stores and API clients
- Section dividers in large files: `// ----------- Actions -----------` or `// ----------- Reducer -----------`
- Inline comments for non-obvious logic: `// If loadSettings fails (e.g., not running inside Tauri)`
- Model files use `/** Mirrors Rust X struct */` pattern to document backend correspondence

**JSDoc/TSDoc:**
- Used on exported functions in API clients: `/** Get recommended default settings (no disk read). */`
- Used on interface properties when non-obvious: `/** User's Xbox Live gamer tag (used for save imports/exports). */`
- Used on route configuration: `/** Whether this route appears in the sidebar navigation */`

## Function Design

**Size:** Functions kept small — reducers are pure switch/case, API clients are single-invoke wrappers, components delegate to sub-components.

**Parameters:**
- API client functions take individual typed parameters (not objects): `addLibrarySource(libraryMetadataPath: string, path: string)`
- Complex inputs use dedicated interfaces: `createManualGame(libraryMetadataPath: string, input: ManualGameInput)`
- Default parameters used sparingly: `allowWarnings = false`

**Return Values:**
- API clients return typed promises: `Promise<AddSourceResult>`
- Selectors return derived/computed values from state
- Reducers return new state (immutable updates via spread)

## Module Design

**Exports:**
- Named exports preferred: `export function Sidebar()`, `export const routes`
- Default export only for root `App.tsx` and lazy-loaded page components
- `INITIAL_STATE` / `INITIAL_*_STATE` exported alongside reducer and context

**Context/Provider pattern:**
Each feature has a consistent 3-file pattern:
1. `{feature}Store.ts` — defines `*State`, `*Action`, reducer, `INITIAL_*_STATE`, context, `use*()` hook
2. `{Feature}Provider.tsx` — wraps children in context, loads initial data via `useEffect`
3. Components consume via `use*()` hook from store

**Barrel files:** Not used — imports reference specific files directly.

## CSS Conventions

**Approach:** Plain CSS files co-located with components (no CSS modules, no CSS-in-JS, no Tailwind).

**Naming:** BEM-like convention: `sidebar`, `sidebar__header`, `sidebar__link`, `sidebar__link--active`

**Theming:** CSS custom properties on `:root` in `src/styles/app.css` — `--color-bg-primary`, `--color-accent`, `--radius-md`, etc.

## React Patterns

**Component style:**
- Function declarations (not arrow functions): `export function Sidebar() {`
- Props interfaces defined inline or above the component
- No class components

**State management:**
- React Context + `useReducer` (no Redux, no Zustand)
- One context per feature domain
- Selectors as pure functions exported from store file

**Routing:**
- `react-router-dom` v7 with `Routes`/`Route`/`Navigate`
- Lazy loading via `React.lazy()` + `Suspense` for all page components
- Central route registry in `src/app/router.tsx`

---

*Convention analysis: 2026-03-27*
