import { describe, it, expect } from "vitest";
import {
  libraryReducer,
  INITIAL_LIBRARY_STATE,
  type LibraryState,
  type LibraryAction,
} from "../state/libraryStore";
import type { LibrarySource, NestedSourceWarning } from "../model/libraryTypes";

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

  it("unknown action returns state unchanged", () => {
    const state = { ...INITIAL_LIBRARY_STATE, initialized: true };
    const next = libraryReducer(state, { type: "UNKNOWN" } as any);
    expect(next).toEqual(state);
  });
});
