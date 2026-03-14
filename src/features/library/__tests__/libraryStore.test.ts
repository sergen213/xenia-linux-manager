import { describe, it, expect } from "vitest";
import {
  libraryReducer,
  INITIAL_LIBRARY_STATE,
  type LibraryState,
  type LibraryAction,
} from "../state/libraryStore";
import type { LibrarySource, NestedSourceWarning } from "../model/libraryTypes";
import type { GamePatchInventory } from "../model/patchTypes";
import type {
  ProfileInventory,
  EffectiveConfig,
  RecommendationAvailability,
} from "../model/profileTypes";

const mockSource: LibrarySource = {
  id: "src-1",
  root_path: "/games/xbox360",
  label: "xbox360",
  created_at: 1000,
  updated_at: 1000,
  last_scan_summary: null,
};

const mockSource2: LibrarySource = {
  id: "src-2",
  root_path: "/media/games",
  label: "games",
  created_at: 2000,
  updated_at: 2000,
  last_scan_summary: null,
};

const mockInventory: GamePatchInventory = {
  game_id: "game-1",
  active_patch_id: null,
  files: [],
};

describe("libraryReducer", () => {
  it("starts with initial state", () => {
    expect(INITIAL_LIBRARY_STATE.sources).toEqual([]);
    expect(INITIAL_LIBRARY_STATE.initialized).toBe(false);
    expect(INITIAL_LIBRARY_STATE.loading).toBe(false);
  });

  it("LOAD_START sets loading", () => {
    const next = libraryReducer(INITIAL_LIBRARY_STATE, { type: "LOAD_START" });
    expect(next.loading).toBe(true);
    expect(next.error).toBeNull();
  });

  it("LOAD_SUCCESS stores sources and marks initialized", () => {
    const action: LibraryAction = {
      type: "LOAD_SUCCESS",
      sources: [mockSource],
      activeScans: 0,
      queuedScans: 0,
    };
    const next = libraryReducer(INITIAL_LIBRARY_STATE, action);
    expect(next.sources).toEqual([mockSource]);
    expect(next.initialized).toBe(true);
    expect(next.loading).toBe(false);
  });

  it("LOAD_ERROR stores error and marks initialized", () => {
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "LOAD_ERROR",
      error: "test error",
    });
    expect(next.error).toBe("test error");
    expect(next.initialized).toBe(true);
  });

  it("ADD_SOURCE appends source and stores warnings", () => {
    const warnings: NestedSourceWarning[] = [
      {
        new_path: "/games/xbox360/dlc",
        existing_id: "src-1",
        existing_path: "/games/xbox360",
        relationship: "child",
      },
    ];
    const state: LibraryState = {
      ...INITIAL_LIBRARY_STATE,
      sources: [mockSource],
      initialized: true,
    };
    const next = libraryReducer(state, {
      type: "ADD_SOURCE",
      source: mockSource2,
      warnings,
    });
    expect(next.sources).toHaveLength(2);
    expect(next.sources[1]).toEqual(mockSource2);
    expect(next.lastWarnings).toEqual(warnings);
  });

  it("REMOVE_SOURCE removes by ID", () => {
    const state: LibraryState = {
      ...INITIAL_LIBRARY_STATE,
      sources: [mockSource, mockSource2],
      initialized: true,
    };
    const next = libraryReducer(state, {
      type: "REMOVE_SOURCE",
      sourceId: "src-1",
    });
    expect(next.sources).toHaveLength(1);
    expect(next.sources[0].id).toBe("src-2");
  });

  it("SCAN_STARTED updates scan counts", () => {
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "SCAN_STARTED",
      activeScans: 1,
      queuedScans: 2,
    });
    expect(next.activeScans).toBe(1);
    expect(next.queuedScans).toBe(2);
  });

  it("SCAN_FINISHED updates sources and scan counts", () => {
    const updatedSource = {
      ...mockSource,
      last_scan_summary: {
        found: 5,
        duplicates: 0,
        warnings: 0,
        skipped: 0,
        status: "completed",
        completed_at: 3000,
      },
    };
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "SCAN_FINISHED",
      sources: [updatedSource],
      activeScans: 0,
      queuedScans: 0,
    });
    expect(next.sources[0].last_scan_summary?.found).toBe(5);
    expect(next.activeScans).toBe(0);
  });

  it("SET_ERROR and CLEAR_ERROR manage error state", () => {
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "SET_ERROR",
      error: "something broke",
    });
    expect(next.error).toBe("something broke");

    const cleared = libraryReducer(next, { type: "CLEAR_ERROR" });
    expect(cleared.error).toBeNull();
  });

  it("CLEAR_WARNINGS empties lastWarnings", () => {
    const state: LibraryState = {
      ...INITIAL_LIBRARY_STATE,
      lastWarnings: [
        {
          new_path: "/a",
          existing_id: "x",
          existing_path: "/b",
          relationship: "child",
        },
      ],
    };
    const next = libraryReducer(state, { type: "CLEAR_WARNINGS" });
    expect(next.lastWarnings).toEqual([]);
  });

  it("CATALOGS_LOADED stores catalogs", () => {
    const catalogs = [
      {
        source_id: "src-1",
        candidates: [],
        last_scan_summary: {
          found: 5,
          duplicates: 1,
          warnings: 0,
          skipped: 0,
          errors: 0,
          status: "completed",
          completed_at: 3000,
          was_cancelled: false,
        },
      },
    ];
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "CATALOGS_LOADED",
      catalogs,
    });
    expect(next.catalogs).toEqual(catalogs);
    expect(next.catalogs).toHaveLength(1);
  });

  it("unknown action returns state unchanged", () => {
    const state = { ...INITIAL_LIBRARY_STATE, initialized: true };
    const next = libraryReducer(state, { type: "UNKNOWN" } as any);
    expect(next).toEqual(state);
  });

  it("PATCHES_LOADED stores patch inventory", () => {
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "PATCHES_LOADED",
      inventory: mockInventory,
    });
    expect(next.patchInventory).toEqual(mockInventory);
    expect(next.patchInventoryLoading).toBe(false);
  });

  it("SET_PATCH_CHOOSER toggles chooser state", () => {
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "SET_PATCH_CHOOSER",
      open: true,
      reason: "after-import",
    });
    expect(next.activePatchChooserOpen).toBe(true);
    expect(next.chooserReason).toBe("after-import");
  });

  it("PROFILES_LOADED stores profile inventory", () => {
    const inventory: ProfileInventory = {
      game_id: "game-1",
      active_profile_id: "prof-abc",
      profiles: [
        {
          id: "prof-abc",
          name: "Default",
          source: "local",
          active: true,
          override_count: 3,
          created_at: 1000,
          updated_at: 2000,
        },
      ],
    };
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "PROFILES_LOADED",
      inventory,
    });
    expect(next.profileInventory).toEqual(inventory);
    expect(next.profileInventoryLoading).toBe(false);
  });

  it("PROFILES_LOADING sets loading flag", () => {
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "PROFILES_LOADING",
    });
    expect(next.profileInventoryLoading).toBe(true);
  });

  it("PROFILES_ERROR stores error and clears loading", () => {
    const loading: LibraryState = {
      ...INITIAL_LIBRARY_STATE,
      profileInventoryLoading: true,
    };
    const next = libraryReducer(loading, {
      type: "PROFILES_ERROR",
      error: "failed to load",
    });
    expect(next.profileInventoryLoading).toBe(false);
    expect(next.error).toBe("failed to load");
  });

  it("PROFILE_EFFECTIVE_LOADED stores effective config", () => {
    const config: EffectiveConfig = {
      profile_id: "prof-abc",
      game_id: "game-1",
      fields: [
        { key: "gpu.vsync", value: false, changed: true },
        { key: "gpu.backend", value: "vulkan", changed: false },
      ],
      explicit_overrides: { "gpu.vsync": false },
      changed_count: 1,
      total_count: 2,
    };
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "PROFILE_EFFECTIVE_LOADED",
      config,
    });
    expect(next.profileEffectiveConfig).toEqual(config);
    expect(next.profileEffectiveLoading).toBe(false);
  });

  it("SELECT_GAME clears profile state for different game", () => {
    const state: LibraryState = {
      ...INITIAL_LIBRARY_STATE,
      selectedGameId: "game-1",
      profileInventory: {
        game_id: "game-1",
        active_profile_id: null,
        profiles: [],
      },
      profileEffectiveConfig: {
        profile_id: "p",
        game_id: "game-1",
        fields: [],
        explicit_overrides: {},
        changed_count: 0,
        total_count: 0,
      },
    };
    const next = libraryReducer(state, {
      type: "SELECT_GAME",
      gameId: "game-2",
    });
    expect(next.profileInventory).toBeNull();
    expect(next.profileEffectiveConfig).toBeNull();
  });

  it("SELECT_GAME preserves profile state for same game", () => {
    const inventory: ProfileInventory = {
      game_id: "game-1",
      active_profile_id: null,
      profiles: [],
    };
    const state: LibraryState = {
      ...INITIAL_LIBRARY_STATE,
      selectedGameId: "game-1",
      profileInventory: inventory,
    };
    const next = libraryReducer(state, {
      type: "SELECT_GAME",
      gameId: "game-1",
    });
    expect(next.profileInventory).toEqual(inventory);
  });

  it("RECOMMENDATION_LOADED stores availability", () => {
    const availability: RecommendationAvailability = {
      status: "unsupported",
      reason: "no_source_configured",
    };
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "RECOMMENDATION_LOADED",
      availability,
    });
    expect(next.recommendationAvailability).toEqual(availability);
    expect(next.recommendationLoading).toBe(false);
  });

  it("RECOMMENDATION_LOADING sets loading flag", () => {
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "RECOMMENDATION_LOADING",
    });
    expect(next.recommendationLoading).toBe(true);
  });

  it("RECOMMENDATION_ERROR stores error and clears loading", () => {
    const loading: LibraryState = {
      ...INITIAL_LIBRARY_STATE,
      recommendationLoading: true,
    };
    const next = libraryReducer(loading, {
      type: "RECOMMENDATION_ERROR",
      error: "source unreachable",
    });
    expect(next.recommendationLoading).toBe(false);
    expect(next.error).toBe("source unreachable");
  });

  it("APPLY_RECOMMENDATION_PENDING toggles pending state", () => {
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "APPLY_RECOMMENDATION_PENDING",
      pending: true,
    });
    expect(next.applyRecommendationPending).toBe(true);

    const done = libraryReducer(next, {
      type: "APPLY_RECOMMENDATION_PENDING",
      pending: false,
    });
    expect(done.applyRecommendationPending).toBe(false);
  });

  it("SELECT_GAME clears recommendation state for different game", () => {
    const state: LibraryState = {
      ...INITIAL_LIBRARY_STATE,
      selectedGameId: "game-1",
      recommendationAvailability: {
        status: "unsupported",
        reason: "no_source_configured",
      },
    };
    const next = libraryReducer(state, {
      type: "SELECT_GAME",
      gameId: "game-2",
    });
    expect(next.recommendationAvailability).toBeNull();
  });

  it("RECOMMENDATION_LOADED with available status stores source info", () => {
    const availability: RecommendationAvailability = {
      status: "available",
      source_id: "bundled",
      source_label: "Bundled Baselines",
      baseline: { "gpu.vsync": false },
    };
    const next = libraryReducer(INITIAL_LIBRARY_STATE, {
      type: "RECOMMENDATION_LOADED",
      availability,
    });
    expect(next.recommendationAvailability).toEqual(availability);
    if (next.recommendationAvailability?.status === "available") {
      expect(next.recommendationAvailability.source_label).toBe("Bundled Baselines");
    }
  });
});
