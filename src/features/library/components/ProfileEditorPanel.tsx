import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EffectiveConfig,
  EffectiveField,
  ProfileInventory,
  ProfileSummary,
} from "../model/profileTypes";
import { CustomSelect } from "./CustomSelect";
import { ProfileRawEditor } from "./ProfileRawEditor";
import { mergeProfileDraft } from "../model/profileDraft";

/** Field metadata for the standard labeled editor. */
interface FieldDef {
  key: string;
  label: string;
  category: string;
  type: "boolean" | "string" | "number" | "select";
  options?: string[];
}

/** Known fields exposed through the standard labeled editor. */
const STANDARD_FIELDS: FieldDef[] = [
  { key: "gpu.backend", label: "GPU Backend", category: "GPU", type: "select", options: ["vulkan", "any"] },
  { key: "gpu.vsync", label: "VSync", category: "GPU", type: "boolean" },
  { key: "gpu.framerate_limit", label: "Framerate Limit", category: "GPU", type: "number" },
  { key: "gpu.draw_resolution_scale_x", label: "Resolution Scale X", category: "GPU", type: "number" },
  { key: "gpu.draw_resolution_scale_y", label: "Resolution Scale Y", category: "GPU", type: "number" },
  { key: "gpu.render_target_path_vulkan", label: "Render Target Path", category: "GPU", type: "select", options: ["any", "fbo", "rbo"] },
  { key: "display.fullscreen", label: "Fullscreen", category: "Display", type: "boolean" },
  { key: "display.internal_display_resolution", label: "Internal Resolution", category: "Display", type: "number" },
  { key: "display.postprocess_antialiasing", label: "Anti-aliasing", category: "Display", type: "select", options: ["fxaa", "fxaa_extreme", "none"] },
  { key: "apu.backend", label: "Audio Backend", category: "Audio", type: "select", options: ["any", "sdl", "xaudio2"] },
  { key: "apu.mute", label: "Mute Audio", category: "Audio", type: "boolean" },
  { key: "cpu.backend", label: "CPU Backend", category: "CPU", type: "select", options: ["any", "x64"] },
  { key: "cpu.break_on_unimplemented", label: "Break on Unimplemented", category: "CPU", type: "boolean" },
  { key: "hid.host_radians_per_second", label: "Mouse Sensitivity", category: "Input", type: "number" },
  { key: "kernel.patcher", label: "Kernel Patcher", category: "Kernel", type: "boolean" },
  { key: "memory.protect_zero", label: "Protect Zero Page", category: "Memory", type: "boolean" },
  { key: "storage.mount_cache", label: "Mount Cache", category: "Storage", type: "boolean" },
  { key: "storage.mount_scratch", label: "Mount Scratch", category: "Storage", type: "boolean" },
];

const STANDARD_FIELD_KEYS = new Set(STANDARD_FIELDS.map((field) => field.key));

export type EditorViewMode = "explicit" | "effective";
export type EditorTabMode = "standard" | "raw";

interface ProfileFieldRowProps {
  fieldDef: FieldDef;
  displayValue: unknown;
  isHighlighted: boolean;
  onChange: (key: string, value: unknown) => void;
  onReset: (key: string) => void;
}

const ProfileFieldRow = memo(function ProfileFieldRow({
  fieldDef,
  displayValue,
  isHighlighted,
  onChange,
  onReset,
}: ProfileFieldRowProps) {
  return (
    <div
      className={`profile-editor__field${isHighlighted ? " profile-editor__field--changed" : ""}`}
    >
      <label htmlFor={`field-${fieldDef.key}`}>
        {fieldDef.label}
      </label>
      {renderFieldInput(
        fieldDef,
        displayValue,
        onChange,
      )}
      {isHighlighted && (
        <button
          type="button"
          className="profile-editor__reset ui-button ui-button--small"
          title="Reset to default"
          onClick={() => onReset(fieldDef.key)}
        >
          Reset
        </button>
      )}
    </div>
  );
});

interface ProfileEditorPanelProps {
  inventory: ProfileInventory;
  effectiveConfig: EffectiveConfig | null;
  effectiveLoading: boolean;
  /** Current editor draft. Keys map to values; null means revert to default. */
  draft: Record<string, unknown>;
  dirty: boolean;
  onDraftChange: (draft: Record<string, unknown>) => void;
  onSave: (profileId: string, overrides: Record<string, unknown>) => Promise<void>;
  onDiscard: () => void;
  onCreateProfile: (name: string) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onRenameProfile: (profileId: string, newName: string) => Promise<void>;
  onSelectProfile: (profileId: string | null) => Promise<void>;
  onLoadEffective: (profileId: string) => void;
  savePending: boolean;
}

export function ProfileEditorPanel({
  inventory,
  effectiveConfig,
  effectiveLoading,
  draft,
  dirty,
  onDraftChange,
  onSave,
  onDiscard,
  onCreateProfile,
  onDeleteProfile,
  onRenameProfile,
  onSelectProfile,
  onLoadEffective,
  savePending,
}: ProfileEditorPanelProps) {
  const [viewMode, setViewMode] = useState<EditorViewMode>("explicit");
  const [tabMode, setTabMode] = useState<EditorTabMode>("standard");
  const [newProfileName, setNewProfileName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const draftRef = useRef(draft);

  const activeProfile = inventory.profiles.find((p) => p.active);
  const profileOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...inventory.profiles.map((p) => ({
        value: p.id,
        label: `${p.name}${p.source === "recommended" ? " (Recommended)" : ""}`,
      })),
    ],
    [inventory.profiles],
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Load effective config when active profile changes.
  useEffect(() => {
    if (activeProfile) {
      onLoadEffective(activeProfile.id);
    }
  }, [activeProfile?.id]);

  // Build the field map from effective config for rendering.
  const fieldMap = useMemo(() => {
    const map = new Map<string, EffectiveField>();
    if (effectiveConfig) {
      for (const field of effectiveConfig.fields) {
        map.set(field.key, field);
      }
    }
    return map;
  }, [effectiveConfig]);

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      onDraftChange({ ...draftRef.current, [key]: value });
    },
    [onDraftChange],
  );

  const handleFieldReset = useCallback(
    (key: string) => {
      onDraftChange({ ...draftRef.current, [key]: null });
    },
    [onDraftChange],
  );

  const handleSave = useCallback(async () => {
    if (!activeProfile) return;
    await onSave(
      activeProfile.id,
      mergeProfileDraft(effectiveConfig?.explicit_overrides ?? {}, draft),
    );
  }, [activeProfile, draft, effectiveConfig, onSave]);

  const handleCreateProfile = useCallback(async () => {
    const trimmed = newProfileName.trim();
    if (!trimmed) return;
    await onCreateProfile(trimmed);
    setNewProfileName("");
  }, [newProfileName, onCreateProfile]);

  const handleStartRename = useCallback((profile: ProfileSummary) => {
    setRenamingId(profile.id);
    setRenameValue(profile.name);
  }, []);

  const handleFinishRename = useCallback(async () => {
    if (!renamingId || !renameValue.trim()) return;
    await onRenameProfile(renamingId, renameValue.trim());
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue, onRenameProfile]);

  const categories = useMemo(() => {
    const groups = new Map<string, FieldDef[]>();

    for (const field of STANDARD_FIELDS) {
      const list = groups.get(field.category) ?? [];
      list.push(field);
      groups.set(field.category, list);
    }

    if (effectiveConfig) {
      for (const field of effectiveConfig.fields) {
        if (STANDARD_FIELD_KEYS.has(field.key)) {
          continue;
        }

        const inferred = inferFieldDef(field);
        const list = groups.get(inferred.category) ?? [];
        list.push(inferred);
        groups.set(inferred.category, list);
      }
    }

    return new Map(
      Array.from(groups.entries()).map(([category, fields]) => [
        category,
        fields.sort((left, right) => left.label.localeCompare(right.label)),
      ]),
    );
  }, [effectiveConfig]);

  return (
    <div className="profile-editor">
      {/* Profile selector */}
      <div className="profile-editor__selector">
        <label htmlFor="profile-select">Profile</label>
        <CustomSelect
          id="profile-select"
          value={activeProfile?.id ?? ""}
          options={profileOptions}
          onChange={(v) => void onSelectProfile(v || null)}
        />
      </div>

      {/* Profile lifecycle controls */}
      <div className="profile-editor__lifecycle">
        <div className="profile-editor__create">
          <input
            type="text"
            placeholder="New profile name"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateProfile();
            }}
          />
          <button
            type="button"
            className="ui-button ui-button--primary ui-button--small"
            disabled={!newProfileName.trim()}
            onClick={() => void handleCreateProfile()}
          >
            Create
          </button>
        </div>

        {activeProfile && (
          <div className="profile-editor__actions">
            {renamingId === activeProfile.id ? (
              <>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleFinishRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
                <button type="button" className="ui-button ui-button--primary ui-button--small" onClick={() => void handleFinishRename()}>
                  Confirm
                </button>
                <button type="button" className="ui-button ui-button--small" onClick={() => setRenamingId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="ui-button ui-button--small"
                  onClick={() => handleStartRename(activeProfile)}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--danger ui-button--small"
                  onClick={() => void onDeleteProfile(activeProfile.id)}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {!activeProfile && (
        <p className="profile-editor__hint">
          Select or create a profile to start editing settings.
        </p>
      )}

      {activeProfile && (
        <>
          {/* View mode toggle */}
          <div className="profile-editor__toggles">
            <div className="profile-editor__view-toggle">
              <button
                type="button"
                className={`ui-button ui-button--small ${viewMode === "explicit" ? "is-active" : ""}`}
                onClick={() => setViewMode("explicit")}
              >
                Explicit values
              </button>
              <button
                type="button"
                className={`ui-button ui-button--small ${viewMode === "effective" ? "is-active" : ""}`}
                onClick={() => setViewMode("effective")}
              >
                Full effective config
              </button>
            </div>
            <div className="profile-editor__tab-toggle">
              <button
                type="button"
                className={`ui-button ui-button--small ${tabMode === "standard" ? "is-active" : ""}`}
                onClick={() => setTabMode("standard")}
              >
                Standard
              </button>
              <button
                type="button"
                className={`ui-button ui-button--small ${tabMode === "raw" ? "is-active" : ""}`}
                onClick={() => setTabMode("raw")}
              >
                Raw
              </button>
            </div>
          </div>

          {effectiveLoading ? (
            <div className="profile-editor__loading">Loading effective config...</div>
          ) : tabMode === "standard" ? (
            <div className="profile-editor__fields">
              {Array.from(categories.entries()).map(([category, fields]) => (
                <fieldset key={category} className="profile-editor__category">
                  <legend>{category}</legend>
                  {fields.map((fieldDef) => {
                    const effective = fieldMap.get(fieldDef.key);
                    const isChanged = effective?.changed ?? false;
                    const draftValue =
                      fieldDef.key in draft ? draft[fieldDef.key] : undefined;
                    const displayValue =
                      draftValue !== undefined
                        ? draftValue
                        : effective?.value;

                    // In explicit view mode, only show fields that are changed or in draft.
                    if (
                      viewMode === "explicit" &&
                      !isChanged &&
                      draftValue === undefined
                    ) {
                      return null;
                    }

                    return (
                      <ProfileFieldRow
                        key={fieldDef.key}
                        fieldDef={fieldDef}
                        displayValue={displayValue}
                        isHighlighted={isChanged || draftValue !== undefined}
                        onChange={handleFieldChange}
                        onReset={handleFieldReset}
                      />
                    );
                  })}
                  {viewMode === "explicit" &&
                    fields.every(
                      (f) =>
                        !fieldMap.get(f.key)?.changed &&
                        !(f.key in draft),
                    ) && (
                      <p className="profile-editor__hint">
                        No overrides in {category}
                      </p>
                    )}
                </fieldset>
              ))}
            </div>
          ) : (
            <ProfileRawEditor
              draft={draft}
              effectiveConfig={effectiveConfig}
              viewMode={viewMode}
              onDraftChange={onDraftChange}
            />
          )}

          {/* Save / discard bar */}
          <div className="profile-editor__save-bar">
            <button
              type="button"
              className="ui-button ui-button--primary ui-button--small"
              disabled={!dirty || savePending}
              onClick={() => void handleSave()}
            >
              {savePending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="ui-button ui-button--small"
              disabled={!dirty}
              onClick={onDiscard}
            >
              Discard changes
            </button>
            {dirty && (
              <span className="profile-editor__dirty-indicator">
                Unsaved changes
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function inferFieldDef(field: EffectiveField): FieldDef {
  const [prefix, ...rest] = field.key.split(".");
  const labelSource = rest.length > 0 ? rest.join(" ") : field.key;

  return {
    key: field.key,
    label: toTitleCase(labelSource.replace(/[_.]+/g, " ")),
    category: toTitleCase(prefix || "Advanced"),
    type: inferFieldType(field.value),
  };
}

function inferFieldType(value: unknown): FieldDef["type"] {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  return "string";
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function NumberFieldInput({
  fieldKey,
  value,
  onChange,
}: {
  fieldKey: string;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const [text, setText] = useState(() =>
    value != null && value !== "" ? String(value) : "",
  );

  return (
    <input
      id={`field-${fieldKey}`}
      type="number"
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);

        if (next.trim() === "") {
          onChange(fieldKey, null);
          return;
        }

        const num = Number(next);
        if (!Number.isNaN(num)) {
          onChange(fieldKey, num);
        }
      }}
    />
  );
}

function renderFieldInput(
  fieldDef: FieldDef,
  value: unknown,
  onChange: (key: string, value: unknown) => void,
) {
  switch (fieldDef.type) {
    case "boolean":
      return (
        <input
          id={`field-${fieldDef.key}`}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(fieldDef.key, e.target.checked)}
        />
      );
    case "number":
      return (
        <NumberFieldInput
          key={`${fieldDef.key}:${String(value ?? "")}`}
          fieldKey={fieldDef.key}
          value={value}
          onChange={onChange}
        />
      );
    case "select":
      return (
        <CustomSelect
          id={`field-${fieldDef.key}`}
          value={String(value ?? "")}
          options={(fieldDef.options ?? []).map((opt) => ({ value: opt, label: opt }))}
          onChange={(v) => onChange(fieldDef.key, v)}
        />
      );
    default:
      return (
        <input
          id={`field-${fieldDef.key}`}
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(fieldDef.key, e.target.value)}
        />
      );
  }
}
