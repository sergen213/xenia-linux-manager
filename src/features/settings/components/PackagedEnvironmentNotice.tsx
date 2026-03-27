import { useEffect, useState, useRef } from "react";
import { getEnvironmentDiagnostics } from "../api/releaseClient";
import { useSettings } from "../state/settingsStore";
import type { EnvironmentDiagnostic } from "../model/releaseTypes";
import "./PackagedEnvironmentNotice.css";

/**
 * Packaged-environment notice surface for Settings.
 *
 * Explains risky or unsupported AppImage conditions in plain language,
 * hides technical detail behind a disclosure toggle by default, and
 * reserves hard blocks only for truly unusable conditions.
 *
 * Only renders when the app is running as a packaged AppImage build.
 */
export function PackagedEnvironmentNotice() {
  const { state } = useSettings();
  const metadata = state.releaseMetadata;
  const [diagnostics, setDiagnostics] = useState<EnvironmentDiagnostic[]>([]);
  const [loading, setLoading] = useState(true); // Start with loading=true, let effect set false when done
  const [error, setError] = useState<string | null>(null);

  const isPackaged = metadata?.build_kind === "packaged_appimage";

  // Use ref to track if we've attempted to load, avoiding redundant fetches
  const loadAttemptedRef = useRef(false);
  useEffect(() => {
    if (!isPackaged || loadAttemptedRef.current) return;

    loadAttemptedRef.current = true;

    getEnvironmentDiagnostics()
      .then((diags) => {
        setDiagnostics(diags);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [isPackaged]);

  // Only show this section in packaged builds
  if (!isPackaged) return null;

  if (loading) {
    return (
      <div className="env-notice" data-testid="env-notice-loading">
        <h3 className="env-notice__title">Packaged Environment</h3>
        <p className="env-notice__loading">Checking environment...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="env-notice" data-testid="env-notice-error">
        <h3 className="env-notice__title">Packaged Environment</h3>
        <p className="env-notice__error">
          Could not check environment: {error}
        </p>
      </div>
    );
  }

  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const infos = diagnostics.filter((d) => d.severity === "info");
  const hasWarnings = warnings.length > 0;

  return (
    <div className="env-notice" data-testid="env-notice">
      <h3 className="env-notice__title">Packaged Environment</h3>

      <p className="env-notice__summary">
        {hasWarnings
          ? `This AppImage build detected ${warnings.length} condition${warnings.length > 1 ? "s" : ""} that may affect how the app works on your system. The app will continue to run, but some features might behave differently than expected.`
          : "This AppImage build looks good on your system. No environment issues were detected."}
      </p>

      {hasWarnings && (
        <div className="env-notice__warnings" data-testid="env-notice-warnings">
          {warnings.map((diag) => (
            <DiagnosticItem key={diag.id} diagnostic={diag} />
          ))}
        </div>
      )}

      {infos.length > 0 && (
        <div className="env-notice__infos" data-testid="env-notice-infos">
          <h4 className="env-notice__sub-title">Environment Details</h4>
          {infos.map((diag) => (
            <DiagnosticItem key={diag.id} diagnostic={diag} />
          ))}
        </div>
      )}

      {diagnostics.length === 0 && (
        <p className="env-notice__all-clear" data-testid="env-notice-all-clear">
          All environment checks passed. No issues to report.
        </p>
      )}
    </div>
  );
}

/**
 * Individual diagnostic finding with plain-language summary
 * and expandable technical detail.
 */
function DiagnosticItem({
  diagnostic,
}: {
  diagnostic: EnvironmentDiagnostic;
}) {
  const [expanded, setExpanded] = useState(false);
  const isWarning = diagnostic.severity === "warning";

  return (
    <div
      className={`env-notice__item env-notice__item--${diagnostic.severity}`}
      data-testid={`diagnostic-${diagnostic.id}`}
    >
      <div className="env-notice__item-header">
        <span
          className={`env-notice__severity-icon env-notice__severity-icon--${diagnostic.severity}`}
        >
          {isWarning ? "\u26A0" : "\u2139"}
        </span>
        <span className="env-notice__item-summary">{diagnostic.summary}</span>
      </div>

      {diagnostic.detail && (
        <>
          <button
            className="env-notice__detail-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            data-testid={`diagnostic-toggle-${diagnostic.id}`}
          >
            {expanded ? "Hide technical details" : "Show technical details"}
          </button>

          {expanded && (
            <div
              className="env-notice__detail-content"
              data-testid={`diagnostic-detail-${diagnostic.id}`}
            >
              <pre className="env-notice__detail-pre">{diagnostic.detail}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
