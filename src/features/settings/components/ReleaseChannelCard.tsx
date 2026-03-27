import { useEffect, useState, useRef } from "react";
import { useSettings } from "../state/settingsStore";
import { getReleaseMetadata } from "../api/releaseClient";
import "./ReleaseChannelCard.css";

/**
 * Settings card that surfaces packaged-build release metadata:
 * app name, version, build kind, architecture, release notes link,
 * updater state, and desktop integration recovery actions.
 *
 * Designed to make it obvious when the user is running a packaged
 * AppImage build versus a development session.
 */
export function ReleaseChannelCard() {
  const { state, dispatch } = useSettings();
  const [loading, setLoading] = useState(true); // Start with loading=true to avoid setState in effect
  const [error, setError] = useState<string | null>(null);
  const metadata = state.releaseMetadata;

  const loadAttemptedRef = useRef(false);
  useEffect(() => {
    if (metadata || loadAttemptedRef.current) return;

    loadAttemptedRef.current = true;

    getReleaseMetadata()
      .then((m) => {
        dispatch({ type: "SET_RELEASE_METADATA", metadata: m });
        setLoading(false);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load release info",
        );
        setLoading(false);
      });
  }, [metadata, dispatch]);

  if (loading) {
    return (
      <div className="release-card" data-testid="release-card-loading">
        <h3 className="release-card__title">Release Information</h3>
        <p className="release-card__loading">Loading release metadata...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="release-card" data-testid="release-card-error">
        <h3 className="release-card__title">Release Information</h3>
        <p className="release-card__error">{error}</p>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="release-card" data-testid="release-card-empty">
        <h3 className="release-card__title">Release Information</h3>
        <p className="release-card__empty">
          Release metadata is not available in this environment.
        </p>
      </div>
    );
  }

  return (
    <div className="release-card" data-testid="release-card">
      <h3 className="release-card__title">Release Information</h3>

      <div className="release-card__identity">
        <span className="release-card__app-name">
          Xenia Manager for Linux
        </span>
        <span
          className={`release-card__build-badge release-card__build-badge--${metadata.build_kind}`}
        >
          {metadata.build_kind_label}
        </span>
      </div>

      <div className="release-card__metadata">
        <MetadataRow label="Version" value={metadata.version} />
        <MetadataRow label="Architecture" value={metadata.architecture} />
        <MetadataRow
          label="Build Kind"
          value={
            metadata.build_kind === "packaged_appimage"
              ? "Linux AppImage"
              : "Development Build"
          }
        />
      </div>

      {metadata.release_notes_url && (
        <a
          className="release-card__notes-link"
          href={metadata.release_notes_url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="release-notes-link"
        >
          View release notes
        </a>
      )}

      <div className="release-card__updater-section">
        <h4 className="release-card__updater-title">Updater Status</h4>
        <div
          className={`release-card__updater-status release-card__updater-status--${metadata.updater.available ? "ready" : "unavailable"}`}
        >
          <span className="release-card__updater-indicator" />
          <span className="release-card__updater-label">
            {metadata.updater.available
              ? "In-app updates available"
              : "In-app updates not available"}
          </span>
        </div>
        <p className="release-card__updater-reason">{metadata.updater.reason}</p>

        <div className="release-card__updater-checks">
          <UpdaterCheck
            label="Packaged build"
            met={metadata.updater.is_packaged}
          />
          <UpdaterCheck
            label="Signing key configured"
            met={metadata.updater.has_pubkey}
          />
          <UpdaterCheck
            label="Update endpoints configured"
            met={metadata.updater.has_endpoints}
          />
        </div>
      </div>

      {metadata.build_kind === "packaged_appimage" && (
        <div className="release-card__desktop-section">
          <h4 className="release-card__desktop-title">Desktop Integration</h4>
          <p className="release-card__desktop-text">
            Desktop integration settings like menu entries and file associations
            can be managed through your system's application menu or by
            re-running the AppImage with the <code>--install</code> flag.
          </p>
        </div>
      )}
    </div>
  );
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="release-card__row">
      <span className="release-card__row-label">{label}</span>
      <span className="release-card__row-value">{value}</span>
    </div>
  );
}

function UpdaterCheck({
  label,
  met,
}: {
  label: string;
  met: boolean;
}) {
  return (
    <div className="release-card__check" data-testid={`updater-check-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span
        className={`release-card__check-icon release-card__check-icon--${met ? "met" : "unmet"}`}
      >
        {met ? "\u2713" : "\u2717"}
      </span>
      <span className="release-card__check-label">{label}</span>
    </div>
  );
}
