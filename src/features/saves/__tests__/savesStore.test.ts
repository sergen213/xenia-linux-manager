import { describe, expect, it } from "vitest";
import {
  INITIAL_SAVES_STATE,
  savesReducer,
  type SavesState,
} from "../state/savesStore";

describe("savesReducer", () => {
  it("SET_ACTIVE_GAME resets export-specific state when game changes", () => {
    const state: SavesState = {
      ...INITIAL_SAVES_STATE,
      activeGameId: "game-1",
      saveQuickActionsOpen: true,
      exportPreflightLoading: true,
      lastExportResult: {
        game_id: "game-1",
        game_title: "Test Game",
        archive_filename: "export.zip",
        archive_path: "/tmp/export.zip",
        items_exported: 1,
        total_size_bytes: 1024,
      },
    };

    const next = savesReducer(state, { type: "SET_ACTIVE_GAME", gameId: "game-2" });
    expect(next.activeGameId).toBe("game-2");
    expect(next.saveQuickActionsOpen).toBe(false);
    expect(next.exportPreflightLoading).toBe(false);
    expect(next.lastExportResult).toBeNull();
  });

  it("CLEAR_SAVE_STATE clears transient save workflow state", () => {
    const state: SavesState = {
      ...INITIAL_SAVES_STATE,
      exportPending: true,
      importWizardStep: "result",
      importArchivePath: "/tmp/archive.zip",
      backupFailureError: "backup failed",
    };

    const next = savesReducer(state, { type: "CLEAR_SAVE_STATE" });
    expect(next.exportPending).toBe(false);
    expect(next.importWizardStep).toBe("idle");
    expect(next.importArchivePath).toBeNull();
    expect(next.backupFailureError).toBeNull();
  });
});
