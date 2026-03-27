import { useState } from "react";
import { useXenia } from "../state/xeniaStore";
import { useSettings } from "../../settings/state/settingsStore";
import {
  startInstall,
  startUpdate,
  retryLastOperation,
  fetchLatestRelease,
  getInstallStatus,
} from "../api/xeniaClient";
import type { PrimaryAction, LinuxRelease } from "../model/xeniaTypes";
import "./XeniaLifecycleDialog.css";

interface XeniaLifecycleDialogProps {
  action: PrimaryAction;
  onClose: () => void;
}

type DialogPhase = "confirm" | "progress" | "success" | "error";

/**
 * Modal dialog that handles the confirmation, progress, and result
 * phases of an install/update/retry operation.
 */
export function XeniaLifecycleDialog({
  action,
  onClose,
}: XeniaLifecycleDialogProps) {
  const { state, dispatch } = useXenia();
  const { state: settingsState } = useSettings();
  const [phase, setPhase] = useState<DialogPhase>("confirm");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const appDataPath = settingsState.settings?.app_data_path ?? "";
  const xeniaPath = settingsState.settings?.xenia_path ?? "";
  const release = state.latestRelease ?? state.availableUpdate;

  const actionLabel =
    action === "install" ? "Install" : action === "update" ? "Update" : action === "retry" ? "Retry" : "Check";

  const handleConfirm = async () => {
    setPhase("progress");
    try {
      let id: string;
      if (action === "retry") {
        id = await retryLastOperation(appDataPath, xeniaPath);
      } else if (action === "update" && release) {
        id = await startUpdate(appDataPath, xeniaPath, release);
      } else {
        // Install -- fetch release if not already available
        let installRelease = release;
        if (!installRelease) {
          installRelease = await fetchLatestRelease();
          dispatch({ type: "FETCH_RELEASE_SUCCESS", release: installRelease });
        }
        id = await startInstall(appDataPath, xeniaPath, installRelease);
      }
      setJobId(id);
      // We do not wait for the job to finish -- the task subsystem
      // handles progress tracking. Show success phase to indicate
      // the job has been launched.
      setPhase("success");

      // Refresh install state after a short delay to pick up changes
      setTimeout(async () => {
        try {
          const installState = await getInstallStatus(appDataPath);
          dispatch({ type: "SET_INSTALL_STATE", installState });
        } catch {
          // non-critical
        }
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="xenia-dialog-overlay"
      onClick={handleOverlayClick}
      data-testid="xenia-dialog-overlay"
    >
      <div className="xenia-dialog" data-testid="xenia-lifecycle-dialog">
        {phase === "confirm" && (
          <ConfirmPhase
            actionLabel={actionLabel}
            release={release}
            failure={state.installState.failure}
            onConfirm={handleConfirm}
            onCancel={onClose}
          />
        )}

        {phase === "progress" && (
          <ProgressPhase actionLabel={actionLabel} />
        )}

        {phase === "success" && (
          <SuccessPhase
            actionLabel={actionLabel}
            jobId={jobId}
            onClose={onClose}
          />
        )}

        {phase === "error" && (
          <ErrorPhase
            error={error}
            onRetry={handleConfirm}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-phases
// ---------------------------------------------------------------------------

function ConfirmPhase({
  actionLabel,
  release,
  failure,
  onConfirm,
  onCancel,
}: {
  actionLabel: string;
  release: LinuxRelease | null;
  failure: import("../model/xeniaTypes").FailureContext | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div data-testid="dialog-confirm-phase">
      <h3 className="xenia-dialog__title">{actionLabel} Xenia Canary</h3>

      {release && (
        <div className="xenia-dialog__release-info">
          <p>
            <strong>Version:</strong> {release.tag}
          </p>
          <p>
            <strong>Released:</strong>{" "}
            {new Date(release.published_at).toLocaleDateString()}
          </p>
          <p>
            <strong>Size:</strong> {formatBytes(release.size_bytes)}
          </p>
        </div>
      )}

      {failure && (
        <div className="xenia-dialog__failure-context">
          <p className="xenia-dialog__failure-label">Previous failure:</p>
          <p className="xenia-dialog__failure-error">{failure.error}</p>
          <p className="xenia-dialog__failure-step">
            Failed at: {failure.failed_step}
          </p>
        </div>
      )}

      {actionLabel === "Update" && release && (
        <div className="xenia-dialog__update-notice">
          <p className="xenia-dialog__update-heading">
            A new version is available
          </p>
          <p className="xenia-dialog__update-detail">
            This update will replace your current Xenia Canary installation with
            version <strong>{release.tag}</strong>. Your game library, saves,
            patches, and profiles will not be affected.
          </p>
          <p className="xenia-dialog__update-notes-link">
            Review what changed before updating:{" "}
            <a
              href={`https://github.com/xenia-canary/xenia-canary/releases/tag/${release.tag}`}
              target="_blank"
              rel="noopener noreferrer"
              className="xenia-dialog__link"
              data-testid="update-release-notes"
            >
              Release notes for {release.tag}
            </a>
          </p>
        </div>
      )}

      <p className="xenia-dialog__confirm-text">
        {actionLabel === "Update"
          ? "By clicking Update below, you confirm that you want to replace the current Xenia build. The download will run in the background."
          : "This will download and install the Linux Canary build. You can continue using the app while the operation runs in the background."}
      </p>

      <div className="xenia-dialog__actions">
        <button
          className="xenia-dialog__cancel-btn"
          onClick={onCancel}
          data-testid="dialog-cancel"
        >
          Cancel
        </button>
        <button
          className="xenia-dialog__confirm-btn"
          onClick={onConfirm}
          data-testid="dialog-confirm"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function ProgressPhase({ actionLabel }: { actionLabel: string }) {
  return (
    <div data-testid="dialog-progress-phase">
      <h3 className="xenia-dialog__title">Starting {actionLabel}...</h3>
      <p className="xenia-dialog__progress-text">
        Launching the background job. Track progress in the Tasks page.
      </p>
      <div className="xenia-dialog__spinner" />
    </div>
  );
}

function SuccessPhase({
  actionLabel,
  jobId,
  onClose,
}: {
  actionLabel: string;
  jobId: string | null;
  onClose: () => void;
}) {
  return (
    <div data-testid="dialog-success-phase">
      <h3 className="xenia-dialog__title">{actionLabel} Started</h3>
      <p className="xenia-dialog__success-text">
        The operation is running in the background. You can close this dialog
        and continue using the app.
      </p>

      <div className="xenia-dialog__next-steps">
        <h4 className="xenia-dialog__next-title">Next steps</h4>
        <ul className="xenia-dialog__next-list">
          <li>Monitor progress in the Tasks page</li>
          <li>Set up your game library once installation completes</li>
          <li>Review emulator settings for optimal performance</li>
        </ul>
      </div>

      {jobId && (
        <p className="xenia-dialog__job-id">
          Job ID: <code>{jobId}</code>
        </p>
      )}

      <div className="xenia-dialog__actions">
        <button
          className="xenia-dialog__confirm-btn"
          onClick={onClose}
          data-testid="dialog-close"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ErrorPhase({
  error,
  onRetry,
  onClose,
}: {
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div data-testid="dialog-error-phase">
      <h3 className="xenia-dialog__title xenia-dialog__title--error">
        Operation Failed
      </h3>
      <p className="xenia-dialog__error-text">{error ?? "Unknown error"}</p>
      <div className="xenia-dialog__actions">
        <button
          className="xenia-dialog__cancel-btn"
          onClick={onClose}
          data-testid="dialog-error-close"
        >
          Close
        </button>
        <button
          className="xenia-dialog__confirm-btn"
          onClick={onRetry}
          data-testid="dialog-error-retry"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
