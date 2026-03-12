import { useCallback, useEffect, useState } from "react";
import { useSettings } from "../state/settingsStore";
import { saveSettings, validatePaths } from "../api/settingsClient";
import { PATH_FIELDS } from "../model/settingsSchema";
import type { AppSettings, SettingsValidation } from "../model/settingsSchema";
import "./EditPathsDialog.css";

interface EditPathsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Dialog for editing storage paths after initial setup.
 *
 * Shows current paths, allows edits, validates in real time, and
 * requires confirmation with an impact summary before applying.
 */
export function EditPathsDialog({ open, onClose }: EditPathsDialogProps) {
  const { state, dispatch } = useSettings();
  const { settings } = state;

  // Local draft so edits don't affect global state until confirmed.
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [localValidation, setLocalValidation] =
    useState<SettingsValidation | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Reset draft whenever dialog opens.
  useEffect(() => {
    if (open && settings) {
      setDraft({ ...settings });
      setLocalValidation(null);
      setSaveError(null);
      setShowConfirm(false);
    }
  }, [open, settings]);

  const handleChange = useCallback(
    async (field: string, value: string) => {
      if (!draft) return;
      const updated = { ...draft, [field]: value };
      setDraft(updated);
      setShowConfirm(false);

      try {
        const result = await validatePaths(updated);
        setLocalValidation(result);
      } catch {
        // keep stale validation
      }
    },
    [draft],
  );

  const changedFields = draft && settings
    ? PATH_FIELDS.filter(
        (f) =>
          (draft as Record<string, unknown>)[f.key] !==
          (settings as Record<string, unknown>)[f.key],
      )
    : [];

  const handleSaveClick = useCallback(() => {
    if (changedFields.length === 0) {
      onClose();
      return;
    }
    setShowConfirm(true);
  }, [changedFields, onClose]);

  const handleConfirmSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);

    try {
      const result = await saveSettings(draft);
      dispatch({ type: "SET_SETTINGS", settings: draft });
      dispatch({ type: "SAVE_SUCCESS", validation: result });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }, [draft, dispatch, onClose]);

  if (!open || !draft) return null;

  const allValid = localValidation?.all_valid ?? true;

  return (
    <div
      className="edit-paths-overlay"
      role="dialog"
      aria-label="Edit storage paths"
      aria-modal="true"
    >
      <div className="edit-paths">
        <header className="edit-paths__header">
          <h2 className="edit-paths__title">Edit Storage Paths</h2>
          <button
            className="edit-paths__close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            x
          </button>
        </header>

        <div className="edit-paths__fields">
          {PATH_FIELDS.map((field) => {
            const pathVal = localValidation?.[field.validationKey];
            const isInvalid = pathVal && !pathVal.valid;

            return (
              <div
                key={field.key}
                className={`edit-paths__field ${isInvalid ? "edit-paths__field--invalid" : ""}`}
              >
                <label
                  className="edit-paths__label"
                  htmlFor={`edit-${field.key}`}
                >
                  {field.label}
                </label>
                <input
                  id={`edit-${field.key}`}
                  className="edit-paths__input"
                  type="text"
                  value={(draft as Record<string, unknown>)[field.key] as string}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  aria-invalid={isInvalid ? "true" : undefined}
                />
                {isInvalid && pathVal.reason && (
                  <p className="edit-paths__error" role="alert">
                    {pathVal.reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {showConfirm && changedFields.length > 0 && (
          <div className="edit-paths__impact" role="alert">
            <p className="edit-paths__impact-title">
              The following paths will change:
            </p>
            <ul className="edit-paths__impact-list">
              {changedFields.map((f) => (
                <li key={f.key}>
                  <strong>{f.label}:</strong>{" "}
                  {(settings as Record<string, unknown>)[f.key] as string}
                  {" -> "}
                  {(draft as Record<string, unknown>)[f.key] as string}
                </li>
              ))}
            </ul>
            <div className="edit-paths__impact-actions">
              <button
                className="edit-paths__apply-btn"
                onClick={handleConfirmSave}
                disabled={saving || !allValid}
              >
                {saving ? "Saving..." : "Apply Changes"}
              </button>
              <button
                className="edit-paths__cancel-confirm-btn"
                onClick={() => setShowConfirm(false)}
              >
                Go Back
              </button>
            </div>
          </div>
        )}

        {saveError && (
          <div className="edit-paths__save-error" role="alert">
            {saveError}
          </div>
        )}

        {localValidation?.warnings && localValidation.warnings.length > 0 && (
          <div className="edit-paths__warnings" role="alert">
            {localValidation.warnings.map((w, i) => (
              <p key={i} className="edit-paths__warning">
                {w}
              </p>
            ))}
          </div>
        )}

        <div className="edit-paths__actions">
          <button
            className="edit-paths__save-btn"
            onClick={handleSaveClick}
            disabled={saving || !allValid}
          >
            {changedFields.length === 0 ? "Done" : "Review Changes"}
          </button>
          <button className="edit-paths__cancel-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
