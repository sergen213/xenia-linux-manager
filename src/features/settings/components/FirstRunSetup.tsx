import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "../state/settingsStore";
import { saveSettings, validatePaths } from "../api/settingsClient";
import { PATH_FIELDS, getPathValue } from "../model/settingsSchema";
import type { AppSettings, PathFieldKey } from "../model/settingsSchema";
import { AuroraField } from "../../../components/aurora/AuroraField";
import { WindowControls } from "../../../components/aurora/WindowControls";
import { XeniaLifecycleCard } from "../../xenia/components/XeniaLifecycleCard";
import { LibrarySourcesPanel } from "../../library/components/LibrarySourcesPanel";
import { FolderBrowser } from "../../library/components/FolderBrowser";
import { AuroraRadio } from "../../../components/aurora/AuroraRadio";
import {
  useAuroraPrefs,
  THEME_OPTIONS,
  TINT_OPTIONS,
} from "../../../theme/auroraPrefs";
import { open as openDialog } from "../../../platform/bridge";
import { useGamepad } from "../../../components/app-shell/useGamepad";
import {
  activateFocused,
  focusFirst,
  moveFocus,
  scrollActiveRegion,
  type Dir,
} from "../../../components/app-shell/spatialNav";
import "./FirstRunSetup.css";

const PATH_VALIDATION_DEBOUNCE_MS = 300;

const STEPS = ["Storage", "Xenia", "Library", "Appearance"] as const;

/**
 * Gated first-run onboarding wizard.
 *
 * Four steps, all blocking the main app until finished:
 *   1. Confirm/browse the three managed storage paths.
 *   2. Install a Xenia build (reuses the Settings lifecycle cards).
 *   3. Add game library folders (reuses the Settings sources panel).
 *   4. Pick a theme + background tint (renderer prefs in localStorage).
 *
 * Paths live in the settings store as the user edits them; the install and
 * scan subsystems read from that store, so nothing is persisted to disk until
 * the final step flips `setup_complete`.
 */
export function FirstRunSetup() {
  const { state, dispatch } = useSettings();
  const { settings, validation, loading, error } = state;
  const { prefs, setPref } = useAuroraPrefs();
  const [step, setStep] = useState(0);
  // Path field currently being picked via the in-app folder browser (controller
  // mode), or null. Mouse/keyboard use the native OS dialog instead.
  const [browseField, setBrowseField] = useState<{
    key: PathFieldKey;
    label: string;
  } | null>(null);
  const validationTimer = useRef<number | null>(null);
  const validationRequest = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      validationRequest.current += 1;
      if (validationTimer.current != null) {
        window.clearTimeout(validationTimer.current);
      }
    };
  }, []);

  // Controller navigation. FirstRunSetup renders outside AppShell (it gates the
  // shell), so it carries its own gamepad driver: d-pad/left-stick move DOM
  // focus across the wizard's buttons, inputs and radios; A activates the
  // focused control; B steps back.
  //
  // Nav is scoped to the innermost surface so focus can't wander off the wizard:
  // an open dropdown wins, then the folder-browser modal, then the wizard
  // container. The container (not the outer `.first-run`) deliberately excludes
  // the title-bar WindowControls so steering never jumps to minimize/close.
  const navRoot = (): ParentNode =>
    document.querySelector(".custom-select.is-open .custom-select__menu") ??
    document.querySelector(".aurora-modal__panel") ??
    rootRef.current ??
    document;
  const steer = (dir: Dir) => {
    document.body.classList.add("using-controller");
    moveFocus(dir, navRoot());
  };
  const back = () => {
    // Back peels surfaces from the inside out: the folder browser, then an open
    // dropdown, then it steps the wizard back.
    if (browseField) {
      setBrowseField(null);
      return;
    }
    const openSelect = document.querySelector(".custom-select.is-open");
    if (openSelect) {
      (document.activeElement ?? openSelect).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };
  useGamepad({
    onButton: (i) => {
      switch (i) {
        case 14: steer("left"); break;
        case 15: steer("right"); break;
        case 12: steer("up"); break;
        case 13: steer("down"); break;
        case 0: activateFocused(); break;
        case 1: back(); break;
      }
    },
    onAxisDir: steer,
    onScroll: scrollActiveRegion,
  });

  // Seed focus on each step so the d-pad has a starting control (controller
  // only — mouse/keyboard users keep native tab focus).
  useEffect(() => {
    if (!document.body.classList.contains("using-controller")) return;
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) focusFirst(root);
  }, [step]);

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

  const handleBrowse = useCallback(
    async (field: PathFieldKey, label: string) => {
      // Controllers can't drive the native OS dialog — open the in-app,
      // gamepad-steerable folder browser instead (mouse/keyboard keep the
      // native picker: familiar and faster).
      if (document.body.classList.contains("using-controller")) {
        setBrowseField({ key: field, label });
        return;
      }
      const picked = await openDialog({
        directory: true,
        title: `Select ${label} folder`,
      });
      if (typeof picked === "string") {
        void handlePathChange(field, picked);
      }
    },
    [handlePathChange],
  );

  const handleFinish = useCallback(async () => {
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
        <AuroraField />
        <div className="first-run__dragbar" />
        <WindowControls />
        <div className="first-run__loading">Loading settings...</div>
      </div>
    );
  }

  const allValid = validation?.all_valid ?? false;
  const isLastStep = step === STEPS.length - 1;
  // Only the storage step gates progress; install/scan are optional.
  const canAdvance = step === 0 ? allValid : true;

  return (
    <div className="first-run" role="main" aria-label="First run setup">
      <AuroraField />
      <div className="first-run__dragbar" />
      <WindowControls />
      <div
        ref={rootRef}
        className={`first-run__container first-run__container--step-${step}`}
      >
        <header className="first-run__header">
          <h1 className="first-run__title">Welcome to Xenia Linux Manager</h1>
          <ol className="first-run__steps" aria-label="Setup progress">
            {STEPS.map((label, i) => (
              <li
                key={label}
                className={`first-run__step ${i === step ? "is-active" : ""} ${i < step ? "is-done" : ""}`}
                aria-current={i === step ? "step" : undefined}
              >
                <span className="first-run__step-num">{i + 1}</span>
                <span className="first-run__step-label">{label}</span>
              </li>
            ))}
          </ol>
        </header>

        {step === 0 && (
          <>
            <p className="first-run__subtitle">
              Confirm where the app should store its files. You can change these
              later in Settings.
            </p>
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
                    <div className="first-run__path-row">
                      <input
                        id={`path-${field.key}`}
                        className="first-run__path-input"
                        type="text"
                        value={getPathValue(settings, field.key)}
                        onChange={(e) =>
                          handlePathChange(field.key, e.target.value)
                        }
                        aria-invalid={isInvalid ? "true" : undefined}
                        aria-describedby={
                          isInvalid ? `error-${field.key}` : undefined
                        }
                      />
                      <button
                        type="button"
                        className="first-run__browse-btn"
                        onClick={() => handleBrowse(field.key, field.label)}
                      >
                        Browse…
                      </button>
                    </div>
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
          </>
        )}

        {step === 1 && (
          <>
            <p className="first-run__subtitle">
              Install a Xenia build to emulate your games. Pick a build and
              install it — you can add or switch builds anytime in Settings.
            </p>
            <div className="first-run__xenia">
              <XeniaLifecycleCard channel="canary" />
              <XeniaLifecycleCard channel="edge" />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="first-run__subtitle">
              Add folders that hold your games so they appear in your library.
              You can manage these later under Library.
            </p>
            <div className="first-run__library">
              <LibrarySourcesPanel appDataPath={settings.app_data_path} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="first-run__subtitle">
              Choose how the app looks. You can change this anytime under
              Settings → Appearance.
            </p>
            <div className="first-run__appearance">
              <fieldset className="first-run__appearance-group">
                <legend className="first-run__appearance-title">Theme</legend>
                <div role="radiogroup" aria-label="Theme">
                  {THEME_OPTIONS.map(([id, label]) => (
                    <AuroraRadio
                      key={id}
                      label={label}
                      active={prefs.theme === id}
                      onClick={() => setPref("theme", id)}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="first-run__appearance-group">
                <legend className="first-run__appearance-title">Background</legend>
                <div role="radiogroup" aria-label="Background">
                  {TINT_OPTIONS.map(([id, label]) => (
                    <AuroraRadio
                      key={id}
                      label={label}
                      active={prefs.fieldTint === id}
                      onClick={() => setPref("fieldTint", id)}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="first-run__appearance-group">
                <legend className="first-run__appearance-title">Game Info</legend>
                <div role="radiogroup" aria-label="Game screenshots">
                  <AuroraRadio
                    label="Show screenshots"
                    active={settings.show_game_screenshots}
                    onClick={() =>
                      dispatch({ type: "UPDATE_FIELD", field: "show_game_screenshots", value: true })
                    }
                  />
                  <AuroraRadio
                    label="Don't show"
                    active={!settings.show_game_screenshots}
                    onClick={() =>
                      dispatch({ type: "UPDATE_FIELD", field: "show_game_screenshots", value: false })
                    }
                  />
                </div>
                <p className="first-run__appearance-help">
                  Download screenshots for your games from the online title database.
                </p>
              </fieldset>
            </div>
          </>
        )}

        {error && (
          <div className="first-run__error" role="alert">
            <p>{error}</p>
          </div>
        )}

        <div className="first-run__actions">
          {step > 0 && (
            <button
              type="button"
              className="first-run__nav-btn"
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
            >
              Back
            </button>
          )}
          <div className="first-run__actions-spacer" />
          {isLastStep ? (
            <button
              type="button"
              className="first-run__confirm-btn"
              onClick={handleFinish}
              disabled={loading || !canAdvance}
              aria-busy={loading}
            >
              {loading ? "Saving..." : "Finish"}
            </button>
          ) : (
            <button
              type="button"
              className="first-run__confirm-btn"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
            >
              Next
            </button>
          )}
        </div>
      </div>

      {browseField && (
        <FolderBrowser
          initialPath={getPathValue(settings, browseField.key) || undefined}
          onClose={() => setBrowseField(null)}
          onSelect={(picked) => {
            void handlePathChange(browseField.key, picked);
            setBrowseField(null);
          }}
        />
      )}
    </div>
  );
}
