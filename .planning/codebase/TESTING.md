# Testing Patterns

**Analysis Date:** 2026-03-27

## Test Framework

**Runner:**
- Vitest 3.2.4
- Config: `vitest.config.ts` (project root)

**Assertion Library:**
- Vitest built-in (`expect`, `describe`, `it`)
- `@testing-library/jest-dom` v6.6.3 for DOM matchers (`toBeInTheDocument()`, `toHaveClass()`, `toBeDisabled()`)

**Environment:**
- `jsdom` for DOM simulation
- `globals: true` — `describe`, `it`, `expect`, `vi` available without imports (but imports are still used explicitly)

**Setup:**
- `src/test-setup.ts` — single line: `import "@testing-library/jest-dom/vitest";`
- Loaded via `setupFiles: ["./src/test-setup.ts"]` in vitest config

**Run Commands:**
```bash
npm test             # Run all tests (vitest)
npm run lint         # ESLint
npm run build        # TypeScript compile + Vite build (also validates types)
```

## Test File Organization

**Location:**
- Component tests: co-located in `__tests__/` subdirectory within each feature
- Store/reducer tests: co-located in `__tests__/` alongside component tests
- Shared shell components: tests alongside component files (`src/components/app-shell/Sidebar.test.tsx`)
- Router test: alongside source (`src/app/router.test.tsx`)

**Naming:**
- `{ComponentName}.test.tsx` for component tests
- `{storeName}.test.ts` for store/reducer tests

**Full test file inventory (24 files):**
```
src/app/router.test.tsx
src/components/app-shell/AppShell.test.tsx
src/components/app-shell/Sidebar.test.tsx
src/components/app-shell/StatusBar.test.tsx
src/features/dashboard/__tests__/DashboardHome.test.tsx
src/features/library/__tests__/libraryStore.test.ts
src/features/library/__tests__/ProfileEditorPanel.test.tsx
src/features/library/__tests__/ManagePatchesPanel.test.tsx
src/features/library/__tests__/LibrarySourcesPanel.test.tsx
src/features/library/__tests__/LaunchPreflightPanel.test.tsx
src/features/library/__tests__/DiscoveryResultsTable.test.tsx
src/features/library/__tests__/ScanResultsSummary.test.tsx
src/features/saves/__tests__/savesStore.test.ts
src/features/settings/__tests__/settingsStore.test.ts
src/features/settings/__tests__/SettingsPage.test.tsx
src/features/settings/__tests__/FirstRunSetup.test.tsx
src/features/tasks/__tests__/tasksStore.test.ts
src/features/tasks/__tests__/TasksPage.test.tsx
src/features/tasks/__tests__/TaskHistoryCard.test.tsx
src/features/tasks/__tests__/TaskStatusStrip.test.tsx
src/features/xenia/__tests__/xeniaStore.test.ts
src/features/xenia/__tests__/XeniaLifecycleDialog.test.tsx
src/features/xenia/__tests__/XeniaLifecycleCard.test.tsx
src/features/xenia/__tests__/XeniaRecoveryActions.test.tsx
```

## Test Structure

**Store/Reducer test pattern (pure logic):**
```typescript
import { describe, it, expect } from "vitest";
import { settingsReducer, INITIAL_STATE, type SettingsState, type SettingsAction } from "../state/settingsStore";

const mockSettings: AppSettings = { /* ... */ };

describe("settingsReducer", () => {
  it("starts with initial state", () => {
    expect(INITIAL_STATE.settings).toBeNull();
    expect(INITIAL_STATE.initialized).toBe(false);
  });

  it("LOAD_START sets loading", () => {
    const next = settingsReducer(INITIAL_STATE, { type: "LOAD_START" });
    expect(next.loading).toBe(true);
    expect(next.error).toBeNull();
  });
});
```

**Component test pattern (with context mocking):**
```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SettingsContext, INITIAL_STATE } from "../state/settingsStore";

// Mock Tauri invoke globally
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("not in tauri")),
}));

function renderWithContext(state: Partial<SettingsState>) {
  const fullState: SettingsState = { ...INITIAL_STATE, ...state };
  const dispatch = vi.fn();
  return {
    dispatch,
    ...render(
      <SettingsContext value={{ state: fullState, dispatch }}>
        <ComponentUnderTest />
      </SettingsContext>,
    ),
  };
}
```

**Patterns:**
- `describe()` blocks group related tests by component or reducer name
- `it()` for individual test cases with descriptive strings
- Each `it()` tests exactly one behavior
- Mock data defined at file scope, reused across tests
- Factory functions for complex mock objects: `makeJob()`, `makeInstallState()`, `makeRelease()`

## Mocking

**Framework:** Vitest built-in (`vi.fn()`, `vi.mock()`)

**Tauri API mocking (universal pattern):**
```typescript
// Every test file that interacts with Tauri APIs uses this:
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("not in tauri")),
}));
```

**Context mocking:**
- Components are tested by providing mock context values directly via `<SettingsContext value={mockCtx}>` — no need to spin up real providers
- Each context value follows shape: `{ state: { ...INITIAL_STATE, ...overrides }, dispatch: vi.fn() }`
- Multi-context components stack context providers in the same order as `App.tsx`

**Async function mocking:**
```typescript
const onSave = vi.fn().mockResolvedValue(undefined);
const onDraftChange = vi.fn();
// ...
expect(onSave).toHaveBeenCalledWith("profile-1", { "gpu.vsync": false, ... });
```

**Timer mocking (for debounced inputs):**
```typescript
vi.useFakeTimers();
// ... fire events ...
await vi.advanceTimersByTimeAsync(300);
expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1);
vi.useRealTimers();
```

**What to Mock:**
- `@tauri-apps/api/core` invoke — always mocked in test environment (not running in Tauri)
- Context dispatch functions — always `vi.fn()`
- Async callbacks (onSave, onDelete, etc.) — `vi.fn().mockResolvedValue(undefined)`
- Timer-dependent behavior — `vi.useFakeTimers()`

**What NOT to Mock:**
- Reducers — tested directly with real state transitions
- Selector functions — tested directly with real state objects
- Type helpers and pure functions — tested directly
- Model types — real objects used as mock data

## Fixtures and Factories

**Test data defined inline per test file:**
```typescript
const mockSettings: AppSettings = {
  xenia_path: "/home/test/.local/share/xenia-linux-manager/xenia",
  app_data_path: "/home/test/.local/share/xenia-linux-manager/data",
  library_metadata_path: "/home/test/.local/share/xenia-linux-manager/library",
  setup_complete: false,
  last_active_route: null,
  gamer_tag: null,
  click_behavior: "single" as const,
};
```

**Factory functions for repeated shapes:**
```typescript
function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    label: "Test Job",
    category: "test",
    status: "running",
    progress: null,
    logs: [],
    created_at: 1000,
    finished_at: null,
    error: null,
    ...overrides,
  };
}
```

**Pattern:** Factory functions accept `Partial<T>` overrides to create variations without duplicating base objects. Used in `tasksStore.test.ts`, `xeniaStore.test.ts`.

**Location:** Factories are defined at the top of each test file, not in shared fixture files.

## Coverage

**Requirements:** No coverage thresholds enforced.

**View Coverage:**
```bash
npx vitest --coverage   # (requires @vitest/coverage-v8 to be installed)
```

## Test Types

**Unit Tests (reducer/store):**
- Pure function testing — no mocking needed
- Test every action type in the reducer
- Test initial state shape
- Test edge cases (no-op when null state, unknown action type)
- Test selector functions with various state configurations

**Component Tests (UI):**
- Render component with mock context
- Query by role, text, label (`screen.getByRole()`, `screen.getByText()`, `screen.getByLabelText()`)
- Fire events (`fireEvent.click()`, `fireEvent.change()`)
- Assert DOM state changes (`toBeInTheDocument()`, `toHaveClass()`, `toBeDisabled()`)
- Verify callback invocations with expected arguments

**Integration Tests:**
- Router tests verify route rendering with all providers stacked
- `router.test.tsx` serves as integration test — renders actual page components with mock contexts

**E2E Tests:** Not detected — no Playwright, Cypress, or similar E2E framework configured.

## Common Patterns

**Async Testing:**
```typescript
it("debounces path validation while typing", async () => {
  vi.useFakeTimers();
  vi.mocked(invoke).mockResolvedValue(mockValidation);
  renderWithContext({ settings: mockSettings, validation: mockValidation });

  const xeniaInput = screen.getByLabelText("Xenia Emulator");
  fireEvent.change(xeniaInput, { target: { value: "/tmp/x" } });
  fireEvent.change(xeniaInput, { target: { value: "/tmp/xenia" } });

  expect(vi.mocked(invoke)).toHaveBeenCalledTimes(0);
  await vi.advanceTimersByTimeAsync(300);
  expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
```

**Error State Testing:**
```typescript
it("shows error state", () => {
  renderWithContext({
    settings: mockSettings,
    validation: mockValidation,
    error: "Something went wrong",
  });
  expect(screen.getByText("Something went wrong")).toBeInTheDocument();
});
```

**Redundancy guard (unknown action):**
```typescript
it("unknown action returns state unchanged", () => {
  const state = { ...INITIAL_LIBRARY_STATE, initialized: true };
  const unknownAction = { type: "UNKNOWN" } as unknown as LibraryAction;
  const next = libraryReducer(state, unknownAction);
  expect(next).toEqual(state);
});
```

**Multi-context component rendering helper:**
```typescript
function renderApp(initialRoute = "/") {
  return render(
    <SettingsContext value={mockSettingsCtx}>
      <TasksContext value={mockTasksCtx}>
        <MemoryRouter initialEntries={[initialRoute]}>
          {/* ... */}
        </MemoryRouter>
      </TasksContext>
    </SettingsContext>,
  );
}
```

## CSS / Styling Tests

No CSS or visual regression testing detected. Styling is plain CSS with BEM naming, tested implicitly through class assertions:
```typescript
expect(dashboardLink).toHaveClass("sidebar__link--active");
```

---

*Testing analysis: 2026-03-27*
