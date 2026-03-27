import { useCallback, useEffect, useRef } from "react";
import { useSettings } from "../state/settingsStore";
import { saveSettings, validatePaths } from "../api/settingsClient";
import { PATH_FIELDS, getPathValue } from "../model/settingsSchema";
import type { AppSettings } from "../model/settingsSchema";
import "./FirstRunSetup.css";

const PATH_VALIDATION_DEBOUNCE_MS = 300;

/**
 * Gated first-run path confirmation flow.
 *
 * Blocks the main app until the user confirms (or edits) all three
 * managed storage paths. Proposes recommended defaults and shows
 * real-time validation feedback.
 */
export function FirstRunSetup() {
  const { state, dispatch } = useSettings();
  const { settings, validation, loading, error } = state;
  const validationTimer = useRef<number | null>(null);
  const validationRequest = useRef(0);

  useEffect(() => {
    return () => {
      validationRequest.current += 1;
      if (validationTimer.current != null) {
        window.clearTimeout(validationTimer.current);
      }
    };
  }, []);

  const handlePathChange = useCallback(
    async (field: string, value: string) => {
      dispatch({ type: "UPDATE_FIELD", field, value });

      if (!settings) return;
      const updated: AppSettings = { ...settings, [field]: value };

      validationRequest.current += 1;
      const requestId = validationRequest.current;

      if (validationTimer.current != null) {
        window.clearTimeout(validationTimer.current);
      }

      validationTimer.current = window.setTimeout(async () => {
        try {
          const result = await validatePaths(updated);
          if (validationRequest.current !== requestId) {
            return;
          }
          dispatch({ type: "SET_VALIDATION", validation: result });
        } catch {
          // Validation call failed; UI will show stale validation state
        }
      }, PATH_VALIDATION_DEBOUNCE_MS);
    },
    [dispatch, settings],
  );

  const handleConfirm = useCallback(async () => {
    if (!settings) return;

    dispatch({ type: "SAVE_START" });
    try {
      const result = await saveSettings({
        ...settings,
        setup_complete: true,
      });
      dispatch({ type: "SAVE_SUCCESS", validation: result });
    } catch (err) {
      dispatch({
        type: "SAVE_ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [dispatch, settings]);

  if (!settings) {
    return (
      <div className="first-run" role="main" aria-label="First run setup">
        <div className="first-run__loading">Loading settings...</div>
      </div>
    );
  }

  const allValid = validation?.all_valid ?? false;

  return (
    <div className="first-run" role="main" aria-label="First run setup">
      <div className="first-run__container">
        <header className="first-run__header">
          <h1 className="first-run__title">Welcome to Xenia Linux Manager</h1>
          <p className="first-run__subtitle">
            Before you begin, please confirm where the app should store its
            files. You can change these paths later in Settings.
          </p>
        </header>

        <div className="first-run__paths">
          {PATH_FIELDS.map((field) => {
            const pathValidation = validation?.[field.validationKey];
            const isInvalid = pathValidation && !pathValidation.valid;

            return (
              <div
                key={field.key}
                className={`first-run__path-field ${isInvalid ? "first-run__path-field--invalid" : ""}`}
              >
                <label
                  className="first-run__path-label"
                  htmlFor={`path-${field.key}`}
                >
                  {field.label}
                </label>
                <p className="first-run__path-description">
                  {field.description}
                </p>
                <input
                  id={`path-${field.key}`}
                  className="first-run__path-input"
                  type="text"
                  value={getPathValue(settings, field.key)}
                  onChange={(e) => handlePathChange(field.key, e.target.value)}
                  aria-invalid={isInvalid ? "true" : undefined}
                  aria-describedby={
                    isInvalid ? `error-${field.key}` : undefined
                  }
                />
                {isInvalid && pathValidation.reason && (
                  <p
                    id={`error-${field.key}`}
                    className="first-run__path-error"
                    role="alert"
                  >
                    {pathValidation.reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {validation?.warnings && validation.warnings.length > 0 && (
          <div className="first-run__warnings" role="alert">
            {validation.warnings.map((w, i) => (
              <p key={i} className="first-run__warning">
                {w}
              </p>
            ))}
          </div>
        )}

        {error && (
          <div className="first-run__error" role="alert">
            <p>{error}</p>
          </div>
        )}

        <div className="first-run__actions">
          <button
            className="first-run__confirm-btn"
            onClick={handleConfirm}
            disabled={loading || !allValid}
            aria-busy={loading}
          >
            {loading ? "Saving..." : "Confirm and Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
