import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ManagePatchesPanel } from "../components/ManagePatchesPanel";
import * as libraryClient from "../api/libraryClient";
import type { GameXeniaPatches } from "../api/libraryClient";

vi.mock("../api/libraryClient", async () => {
  const actual = await vi.importActual<typeof import("../api/libraryClient")>("../api/libraryClient");
  return {
    ...actual,
    getGameXeniaPatches: vi.fn(),
    toggleXeniaPatchEntry: vi.fn(),
  };
});

const patches: GameXeniaPatches = {
  title_id: "4D5307E6",
  patches_dir: "/tmp/xenia/patches",
  files: [
    {
      file_name: "4D5307E6 - Halo 3.patch.toml",
      file_path: "/tmp/xenia/patches/4D5307E6 - Halo 3.patch.toml",
      title_name: "Halo 3",
      title_id: "4D5307E6",
      entries: [
        {
          name: "60 FPS",
          description: "Unlock framerate",
          author: "Canary",
          is_enabled: true,
        },
      ],
    },
  ],
};

describe("ManagePatchesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no files exist", async () => {
    vi.mocked(libraryClient.getGameXeniaPatches).mockResolvedValue({
      title_id: "4D5307E6",
      patches_dir: "/tmp/xenia/patches",
      files: [],
    });

    render(
      <ManagePatchesPanel
        titleId="4D5307E6"
        appDataPath="/tmp/appdata"
        onImport={vi.fn()}
        importPending={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/no patch files found for title id/i)).toBeInTheDocument();
    });
  });

  it("shows patch file and checklist entries", async () => {
    vi.mocked(libraryClient.getGameXeniaPatches).mockResolvedValue(patches);

    render(
      <ManagePatchesPanel
        titleId="4D5307E6"
        appDataPath="/tmp/appdata"
        onImport={vi.fn()}
        importPending={false}
      />,
    );

    // Note: filename is only shown when there are multiple patch files
    // With 1 file, the version picker is hidden
    await waitFor(() => {
      expect(screen.getByText("60 FPS")).toBeInTheDocument();
      expect(screen.getByText("Unlock framerate")).toBeInTheDocument();
      expect(screen.getByText("by Canary")).toBeInTheDocument();
      expect(screen.getByRole("checkbox")).toBeChecked();
    });
  });
});
