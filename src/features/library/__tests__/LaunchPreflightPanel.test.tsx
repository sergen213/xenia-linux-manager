import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { LaunchPreflightPanel } from "../components/LaunchPreflightPanel";

const basePreflight = {
  game_id: "halo-3",
  game_title: "Halo 3",
  game_executable_path: "/games/halo3/default.xex",
  xenia_executable_path: "/opt/xenia/xenia_canary",
  blockers: [],
  warnings: [],
  can_launch: true,
  requires_confirmation: false,
};

describe("LaunchPreflightPanel", () => {
  it("launches directly when confirmation is not required", () => {
    const onLaunch = vi.fn().mockResolvedValue(undefined);
    const onConfirmWarningLaunch = vi.fn().mockResolvedValue(undefined);

    render(
      <LaunchPreflightPanel
        preflight={basePreflight}
        launchPending={false}
        onLaunch={onLaunch}
        onConfirmWarningLaunch={onConfirmWarningLaunch}
        profileInventory={null}
        profileEffectiveConfig={null}
        profileEffectiveLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Launch in Xenia" }));

    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(onConfirmWarningLaunch).not.toHaveBeenCalled();
  });

  it("routes the main button through warning confirmation when required", () => {
    const onLaunch = vi.fn().mockResolvedValue(undefined);
    const onConfirmWarningLaunch = vi.fn().mockResolvedValue(undefined);

    render(
      <LaunchPreflightPanel
        preflight={{
          ...basePreflight,
          warnings: ["Manual entry detected."],
          requires_confirmation: true,
        }}
        launchPending={false}
        onLaunch={onLaunch}
        onConfirmWarningLaunch={onConfirmWarningLaunch}
        profileInventory={null}
        profileEffectiveConfig={null}
        profileEffectiveLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Launch anyway" }));

    expect(onConfirmWarningLaunch).toHaveBeenCalledTimes(1);
    expect(onLaunch).not.toHaveBeenCalled();
  });
});
