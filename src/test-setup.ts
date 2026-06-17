import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Default `window.xlm` stub so the real platform bridge has a backing surface
// in jsdom. Tests that need specific behavior mock "src/platform/bridge"
// directly; this is only a safety net for unmocked dereferences.
Object.defineProperty(window, "xlm", {
  configurable: true,
  writable: true,
  value: {
    // Never-settling invoke/openDialog: this stub is only a fallback so the
    // real bridge does not dereference an undefined window.xlm. A rejecting
    // fallback would risk stray unhandled rejections from fire-and-forget
    // calls; tests that care about results mock "src/platform/bridge" directly.
    invoke: vi.fn(() => new Promise<never>(() => {})),
    on: vi.fn(() => () => {}),
    convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
    openDialog: vi.fn(
      () => new Promise<{ canceled: boolean; filePaths: string[] }>(() => {}),
    ),
  },
});
