import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  maxCb: null as ((m: boolean) => void) | null,
}));

vi.mock("../../platform/bridge", () => ({
  hasWindowControls: vi.fn(() => true),
  windowMinimize: vi.fn(() => Promise.resolve()),
  windowToggleMaximize: vi.fn(() => Promise.resolve()),
  windowClose: vi.fn(() => Promise.resolve()),
  windowIsMaximized: vi.fn(() => Promise.resolve(false)),
  onWindowMaximizeChange: vi.fn((cb: (m: boolean) => void) => {
    h.maxCb = cb;
    return () => {};
  }),
}));

import * as bridge from "../../platform/bridge";
import { TitleBar } from "./TitleBar";

beforeEach(() => {
  vi.clearAllMocks();
  h.maxCb = null;
  (bridge.hasWindowControls as ReturnType<typeof vi.fn>).mockReturnValue(true);
  (bridge.windowIsMaximized as ReturnType<typeof vi.fn>).mockResolvedValue(false);
});

describe("TitleBar", () => {
  it("renders the window title", () => {
    render(<TitleBar />);
    expect(screen.getByText("Xenia Manager for Linux")).toBeInTheDocument();
  });

  it("wires minimize, maximize, and close buttons to the bridge", () => {
    render(<TitleBar />);
    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    expect(bridge.windowMinimize).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /maximize/i }));
    expect(bridge.windowToggleMaximize).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(bridge.windowClose).toHaveBeenCalledOnce();
  });

  it("swaps to a restore control when the window becomes maximized", async () => {
    render(<TitleBar />);
    // Let the mount effect's windowIsMaximized() seed (false) settle first, so
    // firing the event below is what drives the state — not a leftover microtask.
    await act(async () => {});
    expect(screen.getByRole("button", { name: /maximize/i })).toBeInTheDocument();
    await act(async () => {
      h.maxCb?.(true);
    });
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
  });

  it("keeps a maximize event that arrives before the mount seed resolves", async () => {
    render(<TitleBar />);
    // Event fires before the windowIsMaximized() seed promise has flushed.
    act(() => {
      h.maxCb?.(true);
    });
    // Flushing the seed (resolves false) must NOT clobber the live event.
    await act(async () => {});
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
  });

  it("double-clicking the drag region toggles maximize", () => {
    render(<TitleBar />);
    fireEvent.doubleClick(screen.getByTestId("titlebar-drag"));
    expect(bridge.windowToggleMaximize).toHaveBeenCalledOnce();
  });

  it("hides the controls when the host has no window controls", () => {
    (bridge.hasWindowControls as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(<TitleBar />);
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
    expect(screen.getByText("Xenia Manager for Linux")).toBeInTheDocument();
  });
});
