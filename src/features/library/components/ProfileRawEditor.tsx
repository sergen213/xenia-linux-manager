import { useCallback, useMemo, useState } from "react";
import type { EffectiveConfig } from "../model/profileTypes";
import type { EditorViewMode } from "./ProfileEditorPanel";

interface ProfileRawEditorProps {
  /** Current editor draft (same sparse object as standard editor). */
  draft: Record<string, unknown>;
  effectiveConfig: EffectiveConfig | null;
  viewMode: EditorViewMode;
  onDraftChange: (draft: Record<string, unknown>) => void;
}

/**
 * Advanced raw key editor that reads and writes the same sparse explicit-value
 * document as the standard profile editor. Allows adding arbitrary keys,
 * editing values as JSON, and removing overrides to restore default inheritance.
 */
export function ProfileRawEditor({
  draft,
  effectiveConfig,
  viewMode,
  onDraftChange,
}: ProfileRawEditorProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  // Build sorted entries depending on view mode.
  const entries = useMemo(() => {
    if (viewMode === "effective") {
      // Show all effective fields, merging in draft changes.
      const combined = new Map<string, unknown>();

      if (effectiveConfig) {
        for (const field of effectiveConfig.fields) {
          combined.set(field.key, field.value);
        }
      }
      // Overlay draft entries.
      for (const [key, value] of Object.entries(draft)) {
        if (value === null) {
          // null means revert to default; find the effective value.
          const effective = effectiveConfig?.fields.find((f) => f.key === key);
          if (effective) {
            combined.set(key, effective.value);
          }
        } else {
          combined.set(key, value);
        }
      }

      return Array.from(combined.entries())
        .map(([key, value]) => ({
          key,
          value,
          changed:
            key in draft ||
            effectiveConfig?.fields.find((f) => f.key === key)?.changed === true,
          inDraft: key in draft,
        }))
        .sort((a, b) => a.key.localeCompare(b.key));
    }

    // Explicit mode: show only overrides from effective config + draft.
    const explicit = new Map<string, unknown>();

    // Start from effective config's explicit overrides.
    if (effectiveConfig) {
      for (const [key, value] of Object.entries(
        effectiveConfig.explicit_overrides,
      )) {
        explicit.set(key, value);
      }
    }
    // Overlay draft.
    for (const [key, value] of Object.entries(draft)) {
      if (value === null) {
        explicit.delete(key);
      } else {
        explicit.set(key, value);
      }
    }

    return Array.from(explicit.entries())
      .map(([key, value]) => ({
        key,
        value,
        changed: true,
        inDraft: key in draft,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [draft, effectiveConfig, viewMode]);

  const handleValueChange = useCallback(
    (key: string, rawValue: string) => {
      try {
        const parsed = JSON.parse(rawValue) as unknown;
        setParseError(null);
        onDraftChange({ ...draft, [key]: parsed });
      } catch {
        // Keep the raw string; let user fix.
        setParseError(`Invalid JSON for "${key}"`);
      }
    },
    [draft, onDraftChange],
  );

  const handleRemoveKey = useCallback(
    (key: string) => {
      onDraftChange({ ...draft, [key]: null });
    },
    [draft, onDraftChange],
  );

  const handleAddKey = useCallback(() => {
    const trimmedKey = newKey.trim();
    if (!trimmedKey) return;

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(newValue || "null");
    } catch {
      setParseError(`Invalid JSON value for new key "${trimmedKey}"`);
      return;
    }

    setParseError(null);
    onDraftChange({ ...draft, [trimmedKey]: parsedValue });
    setNewKey("");
    setNewValue("");
  }, [newKey, newValue, draft, onDraftChange]);

  return (
    <div className="profile-raw-editor">
      <p className="profile-raw-editor__hint">
        Edit config values as JSON. Removing a key restores the default value.
      </p>

      {parseError && (
        <div className="profile-raw-editor__error">{parseError}</div>
      )}

      <table className="profile-raw-editor__table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.key}
              className={
                entry.changed
                  ? "profile-raw-editor__row--changed"
                  : ""
              }
            >
              <td className="profile-raw-editor__key">{entry.key}</td>
              <td>
                <input
                  type="text"
                  className="profile-raw-editor__value"
                  value={JSON.stringify(entry.value)}
                  onChange={(e) => handleValueChange(entry.key, e.target.value)}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="profile-raw-editor__remove ui-button ui-button--danger ui-button--small"
                  title="Remove override (restore default)"
                  onClick={() => handleRemoveKey(entry.key)}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}

          {entries.length === 0 && (
            <tr>
              <td colSpan={3} className="profile-raw-editor__empty">
                {viewMode === "explicit"
                  ? "No explicit overrides. All settings use defaults."
                  : "No config fields available."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Add new key */}
      <div className="profile-raw-editor__add">
        <input
          type="text"
          placeholder="config.key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddKey();
          }}
        />
        <input
          type="text"
          placeholder='JSON value (e.g. true, 60, "text")'
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddKey();
          }}
        />
        <button
          type="button"
          className="ui-button ui-button--primary ui-button--small"
          disabled={!newKey.trim()}
          onClick={handleAddKey}
        >
          Add key
        </button>
      </div>
    </div>
  );
}
