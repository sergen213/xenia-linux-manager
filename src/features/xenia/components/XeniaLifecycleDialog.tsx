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
import type {
  FailureContext,
  LinuxRelease,
  PrimaryAction,
  ReleaseChannel,
} from "../model/xeniaTypes";
import { channelLabel } from "../model/xeniaTypes";
import "./XeniaLifecycleDialog.css";

interface XeniaLifecycleDialogProps {
  action: Extract<PrimaryAction, "install" | "update" | "retry">;
  channel: ReleaseChannel;
  release: LinuxRelease | null;
  failure: FailureContext | null;
  onClose: () => void;
}

type DialogPhase = "confirm" | "progress" | "success" | "error";

export function XeniaLifecycleDialog({
  action,
  channel,
  release,
  failure,
  onClose,
}: XeniaLifecycleDialogProps) {
  const { dispatch } = useXenia();
  const { state: settingsState } = useSettings();
  const [phase, setPhase] = useState<DialogPhase>("confirm");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const appDataPath = settingsState.settings?.app_data_path ?? "";
  const xeniaPath = settingsState.settings?.xenia_path ?? "";
  const actionLabel =
    action === "install" ? "Install" : action === "update" ? "Update" : "Retry";

  const handleConfirm = async () => {
    setPhase("progress");
    try {
      let id: string;
      if (action === "retry") {
        id = await retryLastOperation(appDataPath, xeniaPath);
      } else {
        let targetRelease = release;
        if (!targetRelease) {
          targetRelease = await fetchLatestRelease(channel);
        }
        id =
          action === "update"
            ? await startUpdate(appDataPath, xeniaPath, targetRelease)
            : await startInstall(appDataPath, xeniaPath, targetRelease);
      }

      setJobId(id);
      setPhase("success");

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
            channel={channel}
            release={release}
            failure={failure}
            onConfirm={handleConfirm}
            onCancel={onClose}
          />
        )}

        {phase === "progress" && (
          <ProgressPhase actionLabel={actionLabel} channel={channel} />
        )}

        {phase === "success" && (
          <SuccessPhase
            actionLabel={actionLabel}
            channel={channel}
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

function ConfirmPhase({
  actionLabel,
  channel,
  release,
  failure,
  onConfirm,
  onCancel,
}: {
  actionLabel: string;
  channel: ReleaseChannel;
  release: LinuxRelease | null;
  failure: FailureContext | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const title = channelLabel(channel);

  return (
    <div data-testid="dialog-confirm-phase">
      <h3 className="xenia-dialog__title">{actionLabel} {title}</h3>

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
          <p className="xenia-dialog__update-heading">New version available</p>
          <p className="xenia-dialog__update-detail">
            This update will add or switch to version <strong>{release.tag}</strong>.
            Your library, saves, patches, and profiles stay intact.
          </p>
          <p className="xenia-dialog__update-notes-link">
            Review release notes:{" "}
            <a
              href={release.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="xenia-dialog__link"
              data-testid="update-release-notes"
            >
              {release.release_name}
            </a>
          </p>
        </div>
      )}

      <p className="xenia-dialog__confirm-text">
        {actionLabel === "Retry"
          ? "This retries the last failed operation for this channel."
          : "This will run in the background. You can keep using the app while it downloads and installs."}
      </p>

      <div className="xenia-dialog__actions">
        <button
          className="ui-button"
          onClick={onCancel}
          data-testid="dialog-cancel"
        >
          Cancel
        </button>
        <button
          className="ui-button ui-button--primary"
          onClick={onConfirm}
          data-testid="dialog-confirm"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function ProgressPhase({
  actionLabel,
  channel,
}: {
  actionLabel: string;
  channel: ReleaseChannel;
}) {
  return (
    <div data-testid="dialog-progress-phase">
      <h3 className="xenia-dialog__title">
        Starting {actionLabel} for {channelLabel(channel)}...
      </h3>
      <p className="xenia-dialog__progress-text">
        Launching background job. Track progress in Tasks page.
      </p>
      <div className="xenia-dialog__spinner" />
    </div>
  );
}

function SuccessPhase({
  actionLabel,
  channel,
  jobId,
  onClose,
}: {
  actionLabel: string;
  channel: ReleaseChannel;
  jobId: string | null;
  onClose: () => void;
}) {
  return (
    <div data-testid="dialog-success-phase">
      <h3 className="xenia-dialog__title">
        {actionLabel} Started for {channelLabel(channel)}
      </h3>
      <p className="xenia-dialog__success-text">
        Operation running in background. Close dialog, keep using app.
      </p>

      {jobId && (
        <p className="xenia-dialog__job-id">
          Job ID: <code>{jobId}</code>
        </p>
      )}

      <div className="xenia-dialog__actions">
        <button
          className="ui-button ui-button--primary"
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
          className="ui-button"
          onClick={onClose}
          data-testid="dialog-error-close"
        >
          Close
        </button>
        <button
          className="ui-button ui-button--primary"
          onClick={onRetry}
          data-testid="dialog-error-retry"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
