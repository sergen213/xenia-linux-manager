import { describe, it, expect, vi, afterEach } from "vitest";
import {
  windowMinimize,
  windowToggleMaximize,
  windowClose,
} from "./bridge";

const realXlm = window.xlm;
afterEach(() => {
  (window as unknown as { xlm: unknown }).xlm = realXlm;
});

function withWin(win: unknown) {
  (window as unknown as { xlm: unknown }).xlm = { ...window.xlm, win };
}

describe("window control bridge", () => {
  it("delegates actions to the host", async () => {
    const win = {
      minimize: vi.fn(() => Promise.resolve()),
      toggleMaximize: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
    };
    withWin(win);
    await windowMinimize();
    expect(win.minimize).toHaveBeenCalledOnce();
    await windowToggleMaximize();
    expect(win.toggleMaximize).toHaveBeenCalledOnce();
    await windowClose();
    expect(win.close).toHaveBeenCalledOnce();
  });

  it("no-ops safely when controls are unavailable", async () => {
    withWin(undefined);
    await expect(windowMinimize()).resolves.toBeUndefined();
  });
});
