import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ProfileEditorPanel } from "../components/ProfileEditorPanel";
import { ProfileRawEditor } from "../components/ProfileRawEditor";
import type { EffectiveConfig, ProfileInventory } from "../model/profileTypes";

const inventory: ProfileInventory = {
  game_id: "halo-3",
  active_profile_id: "profile-1",
  profiles: [
    {
      id: "profile-1",
      name: "Default",
      source: "local",
      active: true,
      override_count: 1,
      created_at: 1,
      updated_at: 1,
    },
  ],
};

const effectiveConfig: EffectiveConfig = {
  profile_id: "profile-1",
  game_id: "halo-3",
  fields: [
    { key: "gpu.vsync", value: false, changed: true },
    { key: "custom.debug_flag", value: true, changed: true },
  ],
  explicit_overrides: {
    "gpu.vsync": false,
    "custom.debug_flag": true,
  },
  changed_count: 2,
  total_count: 2,
  source: "local",
};

describe("ProfileEditorPanel", () => {
  it("merges existing explicit overrides with the draft before saving", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ProfileEditorPanel
        inventory={inventory}
        effectiveConfig={effectiveConfig}
        effectiveLoading={false}
        draft={{ "gpu.backend": "vulkan" }}
        dirty
        onDraftChange={vi.fn()}
        onSave={onSave}
        onDiscard={vi.fn()}
        onCreateProfile={vi.fn().mockResolvedValue(undefined)}
        onDeleteProfile={vi.fn().mockResolvedValue(undefined)}
        onRenameProfile={vi.fn().mockResolvedValue(undefined)}
        onSelectProfile={vi.fn().mockResolvedValue(undefined)}
        onLoadEffective={vi.fn()}
        savePending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("profile-1", {
      "gpu.vsync": false,
      "custom.debug_flag": true,
      "gpu.backend": "vulkan",
    });
  });

  it("shows dynamically discovered config fields in full effective config view", () => {
    render(
      <ProfileEditorPanel
        inventory={inventory}
        effectiveConfig={effectiveConfig}
        effectiveLoading={false}
        draft={{}}
        dirty={false}
        onDraftChange={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDiscard={vi.fn()}
        onCreateProfile={vi.fn().mockResolvedValue(undefined)}
        onDeleteProfile={vi.fn().mockResolvedValue(undefined)}
        onRenameProfile={vi.fn().mockResolvedValue(undefined)}
        onSelectProfile={vi.fn().mockResolvedValue(undefined)}
        onLoadEffective={vi.fn()}
        savePending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Full effective config" }));

    expect(screen.getByText("Debug Flag")).toBeInTheDocument();
  });

  it("keeps typed numeric values visible while editing standard fields", () => {
    const onDraftChange = vi.fn();

    render(
      <ProfileEditorPanel
        inventory={inventory}
        effectiveConfig={{
          ...effectiveConfig,
          fields: [
            ...effectiveConfig.fields,
            { key: "gpu.draw_resolution_scale_y", value: 2, changed: true },
          ],
          explicit_overrides: {
            ...effectiveConfig.explicit_overrides,
            "gpu.draw_resolution_scale_y": 2,
          },
        }}
        effectiveLoading={false}
        draft={{}}
        dirty
        onDraftChange={onDraftChange}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDiscard={vi.fn()}
        onCreateProfile={vi.fn().mockResolvedValue(undefined)}
        onDeleteProfile={vi.fn().mockResolvedValue(undefined)}
        onRenameProfile={vi.fn().mockResolvedValue(undefined)}
        onSelectProfile={vi.fn().mockResolvedValue(undefined)}
        onLoadEffective={vi.fn()}
        savePending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Full effective config" }));

    const input = screen.getByDisplayValue("2");
    fireEvent.change(input, { target: { value: "3" } });

    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
    expect(onDraftChange).toHaveBeenCalledWith({ "gpu.draw_resolution_scale_y": 3 });
  });
});

describe("ProfileRawEditor", () => {
  it("keeps intermediate invalid JSON text editable until the value becomes valid", () => {
    const onDraftChange = vi.fn();

    render(
      <ProfileRawEditor
        draft={{}}
        effectiveConfig={effectiveConfig}
        viewMode="effective"
        onDraftChange={onDraftChange}
      />,
    );

    const input = screen.getByDisplayValue("true");

    fireEvent.change(input, { target: { value: "f" } });
    expect(screen.getByDisplayValue("f")).toBeInTheDocument();
    expect(screen.getByText('Invalid JSON for "custom.debug_flag"')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "false" } });
    expect(onDraftChange).toHaveBeenCalledWith({ "custom.debug_flag": false });
  });
});
