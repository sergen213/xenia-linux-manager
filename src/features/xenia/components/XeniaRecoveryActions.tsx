import { useState } from "react";
import { useXenia } from "../state/xeniaStore";
import { useSettings } from "../../settings/state/settingsStore";
import {
  clearInstallFailure,
  removeXeniaInstall,
  getInstallStatus,
} from "../api/xeniaClient";
import "./XeniaRecoveryActions.css";

/**
 * Recovery actions panel shown when a Xenia lifecycle operation has failed.
 * Provides cleanup, removal, and links to logs.
 */
export function XeniaRecoveryActions() {
  const { state, dispatch } = useXenia();
  const { state: settingsState } = useSettings();
  const [removing, setRemoving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const failure = state.installState.failure;
  const appDataPath = settingsState.settings?.app_data_path ?? "";
  const isFailed =
    state.installState.status === "install_failed" ||
    state.installState.status === "update_failed";

  if (!isFailed || !failure) return null;

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      await clearInstallFailure(appDataPath);
      const installState = await getInstallStatus(appDataPath);
      dispatch({ type: "SET_INSTALL_STATE", installState });
    } catch {
      // non-critical
    } finally {
      setCleaning(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeXeniaInstall(appDataPath);
      const installState = await getInstallStatus(appDataPath);
      dispatch({ type: "SET_INSTALL_STATE", installState });
    } catch {
      // non-critical
    } finally {
      setRemoving(false);
    }
  };

  const retryModeLabel =
    failure.retry_mode === "update" ? "Update" : "Install";

  return (
    <div className="xenia-recovery" data-testid="xenia-recovery-actions">
      <div className="xenia-recovery__header">
        <h4 className="xenia-recovery__title">
          {retryModeLabel} Failed
        </h4>
        <button
          className="xenia-recovery__details-toggle"
          onClick={() => setShowDetails(!showDetails)}
          data-testid="recovery-toggle-details"
        >
          {showDetails ? "Hide details" : "Show details"}
        </button>
      </div>

      <p className="xenia-recovery__summary" data-testid="recovery-summary">
        {failure.error}
      </p>

      {showDetails && (
        <div className="xenia-recovery__details" data-testid="recovery-details">
          <dl className="xenia-recovery__detail-list">
            <dt>Failed step</dt>
            <dd>{failure.failed_step}</dd>
            <dt>Target version</dt>
            <dd>{failure.target_tag}</dd>
            <dt>Mode</dt>
            <dd>{retryModeLabel}</dd>
            <dt>Failed at</dt>
            <dd>{new Date(failure.failed_at).toLocaleString()}</dd>
          </dl>
        </div>
      )}

      <div className="xenia-recovery__actions">
        <button
          className="xenia-recovery__action-btn xenia-recovery__action-btn--cleanup"
          onClick={handleCleanup}
          disabled={cleaning}
          data-testid="recovery-cleanup"
        >
          {cleaning ? "Cleaning..." : "Clear failure state"}
        </button>

        {state.installState.manifest && (
          <button
            className="xenia-recovery__action-btn xenia-recovery__action-btn--remove"
            onClick={handleRemove}
            disabled={removing}
            data-testid="recovery-remove"
          >
            {removing ? "Removing..." : "Remove Xenia"}
          </button>
        )}
      </div>

      <p className="xenia-recovery__hint">
        View job logs on the Tasks page for more details.
      </p>
    </div>
  );
}
