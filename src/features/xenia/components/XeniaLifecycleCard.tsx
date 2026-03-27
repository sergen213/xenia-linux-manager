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
  removeXeniaInstall,
  getInstallStatus,
  switchActiveXeniaBuild,
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
    if (primaryAction === "check_update") {
      handleCheckForUpdate();
      return;
    }
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

  const [uninstalling, setUninstalling] = useState(false);
  const [switchingBuild, setSwitchingBuild] = useState<string | null>(null);

  const handleUninstall = async () => {
    const appDataPath = settingsState.settings?.app_data_path;
    const xeniaPath = settingsState.settings?.xenia_path;
    if (!appDataPath || !xeniaPath) return;

    setUninstalling(true);
    try {
      await removeXeniaInstall(appDataPath, xeniaPath);
      const installState = await getInstallStatus(appDataPath);
      dispatch({ type: "SET_INSTALL_STATE", installState });
    } catch {
      // non-critical
    } finally {
      setUninstalling(false);
    }
  };

  const handleSwitchBuild = async (tag: string) => {
    const appDataPath = settingsState.settings?.app_data_path;
    if (!appDataPath) return;

    setSwitchingBuild(tag);
    try {
      const installState = await switchActiveXeniaBuild(appDataPath, tag);
      dispatch({ type: "SET_INSTALL_STATE", installState });
    } catch {
      // non-critical
    } finally {
      setSwitchingBuild(null);
    }
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

        {state.installState.installed_builds.length > 1 && (
          <div className="xenia-card__details">
            <span className="xenia-card__detail">Installed builds:</span>
            {state.installState.installed_builds.map((build) => (
              <button
                key={build.tag}
                className="xenia-card__secondary-btn"
                disabled={switchingBuild !== null || build.tag === manifest?.tag}
                onClick={() => void handleSwitchBuild(build.tag)}
                style={{ marginTop: "6px" }}
              >
                {switchingBuild === build.tag
                  ? "Switching..."
                  : build.tag === manifest?.tag
                    ? `${build.tag} (active)`
                    : `Use ${build.tag}`}
              </button>
            ))}
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
            disabled={state.checkingForUpdate || uninstalling}
            data-testid="xenia-primary-action"
          >
            {state.checkingForUpdate ? "Checking..." : primaryActionLabel(primaryAction)}
          </button>

          {isInstalled && (
            <button
              className="xenia-card__secondary-btn xenia-card__secondary-btn--uninstall"
              onClick={handleUninstall}
              disabled={uninstalling}
              data-testid="xenia-uninstall"
            >
              {uninstalling ? "Removing..." : "Uninstall"}
            </button>
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
