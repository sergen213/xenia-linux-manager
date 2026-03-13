import { useState } from "react";
import { useXenia } from "../state/xeniaStore";
import {
  selectPrimaryAction,
  selectInstalledTag,
  selectIsInstalled,
} from "../state/xeniaStore";
import {
  primaryActionLabel,
  lifecycleStatusLabel,
} from "../model/xeniaTypes";
import { useSettings } from "../../settings/state/settingsStore";
import {
  fetchLatestRelease,
  checkForUpdateAuto,
} from "../api/xeniaClient";
import { XeniaLifecycleDialog } from "./XeniaLifecycleDialog";
import "./XeniaLifecycleCard.css";

/**
 * Dashboard card showing Xenia install status, version info,
 * and the adaptive primary action (Install | Update | Retry).
 */
export function XeniaLifecycleCard() {
  const { state, dispatch } = useXenia();
  const { state: settingsState } = useSettings();
  const [dialogOpen, setDialogOpen] = useState(false);

  const primaryAction = selectPrimaryAction(state);
  const installedTag = selectInstalledTag(state);
  const isInstalled = selectIsInstalled(state);
  const manifest = state.installState.manifest;
  const failure = state.installState.failure;
  const status = state.installState.status;

  const handleCheckForUpdate = async () => {
    const appDataPath = settingsState.settings?.app_data_path;
    if (!appDataPath) return;

    dispatch({ type: "CHECK_UPDATE_START" });
    try {
      const update = await checkForUpdateAuto(appDataPath);
      dispatch({ type: "CHECK_UPDATE_SUCCESS", update });
    } catch (err) {
      dispatch({
        type: "CHECK_UPDATE_ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handlePrimaryAction = async () => {
    // For install and update, fetch the latest release first so the dialog
    // can show what will be installed.
    if (primaryAction === "install" || primaryAction === "update") {
      try {
        const release = await fetchLatestRelease();
        dispatch({ type: "FETCH_RELEASE_SUCCESS", release });
      } catch {
        // If fetch fails, dialog will handle it
      }
    }
    setDialogOpen(true);
  };

  const statusDisplay = lifecycleStatusLabel(status);

  const isFailed = status === "install_failed" || status === "update_failed";

  return (
    <>
      <div
        className={`xenia-card ${isFailed ? "xenia-card--failed" : ""}`}
        data-testid="xenia-lifecycle-card"
      >
        <h3 className="xenia-card__title">Xenia</h3>

        <p className="xenia-card__value" data-testid="xenia-card-version">
          {installedTag ?? "--"}
        </p>

        <p className="xenia-card__status" data-testid="xenia-card-status">
          {statusDisplay}
        </p>

        {manifest && (
          <div className="xenia-card__details">
            <span className="xenia-card__detail">
              Released: {new Date(manifest.published_at).toLocaleDateString()}
            </span>
            <span className="xenia-card__detail">
              Installed: {new Date(manifest.installed_at).toLocaleDateString()}
            </span>
          </div>
        )}

        {state.availableUpdate && (
          <p className="xenia-card__update-notice" data-testid="xenia-update-notice">
            Update available: {state.availableUpdate.tag}
          </p>
        )}

        {isFailed && failure && (
          <p className="xenia-card__failure-summary" data-testid="xenia-failure-summary">
            {failure.error}
          </p>
        )}

        <div className="xenia-card__actions">
          <button
            className={`xenia-card__primary-btn xenia-card__primary-btn--${primaryAction}`}
            onClick={handlePrimaryAction}
            data-testid="xenia-primary-action"
          >
            {primaryActionLabel(primaryAction)}
          </button>

          {isInstalled && !state.checkingForUpdate && (
            <button
              className="xenia-card__secondary-btn"
              onClick={handleCheckForUpdate}
              data-testid="xenia-check-update"
            >
              Check for updates
            </button>
          )}

          {state.checkingForUpdate && (
            <span className="xenia-card__checking">Checking...</span>
          )}
        </div>
      </div>

      {dialogOpen && (
        <XeniaLifecycleDialog
          action={primaryAction}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
