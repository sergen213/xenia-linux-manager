import { describe, it, expect, vi, afterEach } from "vitest";
import {
  hasWindowControls,
  windowMinimize,
  windowToggleMaximize,
  windowClose,
  windowIsMaximized,
  onWindowMaximizeChange,
} from "./bridge";

const realXlm = window.xlm;
afterEach(() => {
  (window as unknown as { xlm: unknown }).xlm = realXlm;
});

function withWin(win: unknown) {
  (window as unknown as { xlm: unknown }).xlm = { ...window.xlm, win };
}

describe("window control bridge", () => {
  it("hasWindowControls reflects presence of the win surface", () => {
    withWin(undefined);
    expect(hasWindowControls()).toBe(false);
    withWin({ minimize: vi.fn() });
    expect(hasWindowControls()).toBe(true);
  });

  it("delegates actions to the host", async () => {
    const win = {
      minimize: vi.fn(() => Promise.resolve()),
      toggleMaximize: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
      isMaximized: vi.fn(() => Promise.resolve(true)),
      onMaximizeChange: vi.fn(() => () => {}),
    };
    withWin(win);
    await windowMinimize();
    expect(win.minimize).toHaveBeenCalledOnce();
    await windowToggleMaximize();
    expect(win.toggleMaximize).toHaveBeenCalledOnce();
    await windowClose();
    expect(win.close).toHaveBeenCalledOnce();
    expect(await windowIsMaximized()).toBe(true);
  });

  it("subscribes via onMaximizeChange and returns its unsubscribe", () => {
    const unsub = vi.fn();
    const win = { onMaximizeChange: vi.fn(() => unsub) };
    withWin(win);
    const cb = vi.fn();
    const ret = onWindowMaximizeChange(cb);
    expect(win.onMaximizeChange).toHaveBeenCalledWith(cb);
    ret();
    expect(unsub).toHaveBeenCalledOnce();
  });

  it("no-ops safely when controls are unavailable", async () => {
    withWin(undefined);
    await expect(windowMinimize()).resolves.toBeUndefined();
    expect(await windowIsMaximized()).toBe(false);
    expect(() => onWindowMaximizeChange(vi.fn())()).not.toThrow();
  });
});
