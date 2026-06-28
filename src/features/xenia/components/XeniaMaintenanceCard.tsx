import { useState } from "react";
import { useXenia } from "../state/xeniaStore";
import { useSettings } from "../../settings/state/settingsStore";
import { clearShaderCache, exportLogBundle } from "../api/xeniaClient";
import { openPath } from "../../library/api/libraryClient";
import { formatBytes } from "../../shared/format";
import "./XeniaMaintenanceCard.css";

/**
 * Install-level maintenance actions (shader cache, log bundle). Shared across
 * builds, so this is global rather than per-channel. Hidden until Xenia is
 * installed — both actions resolve the shared Xenia storage root.
 */
export function XeniaMaintenanceCard() {
  const { state } = useXenia();
  const { state: settingsState } = useSettings();
  const appDataPath = settingsState.settings?.app_data_path ?? "";
  const [busy, setBusy] = useState<"cache" | "logs" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.installState.status !== "installed") return null;

  const handleClearCache = async () => {
    setBusy("cache");
    setError(null);
    setMessage(null);
    try {
      const result = await clearShaderCache(appDataPath);
      setMessage(
        result.cleared_paths.length === 0
          ? "No shader cache to clear."
          : `Cleared shader cache (${formatBytes(result.freed_bytes)} freed).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleExportLogs = async () => {
    setBusy("logs");
    setError(null);
    setMessage(null);
    try {
      const result = await exportLogBundle(appDataPath);
      setMessage(
        `Exported ${result.log_count} log file${result.log_count === 1 ? "" : "s"}.`,
      );
      await openPath(result.archive_path, [appDataPath]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="xenia-maintenance" data-testid="xenia-maintenance">
      <h4 className="xenia-maintenance__title">Maintenance</h4>
      <div className="xenia-maintenance__actions">
        <button
          className="ui-button ui-button--small"
          onClick={() => void handleClearCache()}
          disabled={busy !== null}
          data-testid="maintenance-clear-cache"
        >
          {busy === "cache" ? "Clearing..." : "Clear shader cache"}
        </button>
        <button
          className="ui-button ui-button--small"
          onClick={() => void handleExportLogs()}
          disabled={busy !== null}
          data-testid="maintenance-export-logs"
        >
          {busy === "logs" ? "Exporting..." : "Export logs"}
        </button>
      </div>
      {message && <p className="xenia-maintenance__status">{message}</p>}
      {error && <p className="xenia-maintenance__error">{error}</p>}
      <p className="xenia-maintenance__hint">
        Clear the regenerable GPU shader cache, or bundle Xenia logs into a zip for bug reports.
      </p>
    </div>
  );
}
