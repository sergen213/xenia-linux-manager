import { useCallback, useState } from "react";
import { useLibrary } from "../state/libraryStore";
import { useSettings } from "../../settings/state/settingsStore";
import {
  addLibrarySource,
  removeLibrarySource,
  startSourceScan,
  scanAllSources,
  cancelScan,
  getLibraryStatus,
} from "../api/libraryClient";
import type { LibrarySource } from "../model/libraryTypes";
import "./LibrarySourcesPanel.css";

export function LibrarySourcesPanel() {
  const { state, dispatch } = useLibrary();
  const { state: settingsState } = useSettings();
  const [newPath, setNewPath] = useState("");
  const [adding, setAdding] = useState(false);

  const libPath = settingsState.settings?.library_metadata_path ?? "";
  const appDataPath = settingsState.settings?.app_data_path ?? "";

  const refreshStatus = useCallback(async () => {
    if (!libPath) return;
    try {
      const status = await getLibraryStatus(libPath);
      dispatch({
        type: "SCAN_FINISHED",
        sources: status.sources,
        activeScans: status.active_scans,
        queuedScans: status.queued_scans,
      });
    } catch {
      // best-effort refresh
    }
  }, [libPath, dispatch]);

  const handleAdd = useCallback(async () => {
    if (!newPath.trim() || !libPath) return;
    setAdding(true);
    dispatch({ type: "CLEAR_ERROR" });

    try {
      const result = await addLibrarySource(libPath, newPath.trim());
      dispatch({
        type: "ADD_SOURCE",
        source: result.source,
        warnings: result.warnings,
      });
      setNewPath("");
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAdding(false);
    }
  }, [newPath, libPath, dispatch]);

  const handleRemove = useCallback(
    async (sourceId: string) => {
      if (!libPath) return;
      try {
        await removeLibrarySource(libPath, sourceId);
        dispatch({ type: "REMOVE_SOURCE", sourceId });
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [libPath, dispatch],
  );

  const handleScanOne = useCallback(
    async (sourceId: string) => {
      if (!libPath) return;
      try {
        await startSourceScan(libPath, sourceId);
        await refreshStatus();
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [libPath, dispatch, refreshStatus],
  );

  const handleScanAll = useCallback(async () => {
    if (!libPath) return;
    try {
      await scanAllSources(libPath);
      await refreshStatus();
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [libPath, dispatch, refreshStatus]);

  const scanActive = state.activeScans > 0;

  return (
    <div className="sources-panel">
      <div className="sources-panel__header">
        <div>
          <span className="sources-panel__title">Library Sources</span>
          {scanActive && (
            <span className="sources-panel__scan-status">
              {" "}({state.activeScans} scanning
              {state.queuedScans > 0 ? `, ${state.queuedScans} queued` : ""})
            </span>
          )}
        </div>
        <div className="sources-panel__actions">
          {state.sources.length > 0 && (
            <button
              className="sources-panel__btn sources-panel__btn--primary"
              onClick={handleScanAll}
              disabled={scanActive}
            >
              Scan All Now
            </button>
          )}
        </div>
      </div>

      <div className="sources-panel__add-row" style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <input
          type="text"
          className="edit-paths__input"
          placeholder="Enter folder path (e.g. /media/games/xbox360)"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          style={{ flex: 1 }}
        />
        <button
          className="sources-panel__btn sources-panel__btn--primary"
          onClick={handleAdd}
          disabled={adding || !newPath.trim()}
        >
          {adding ? "Adding..." : "Add Source"}
        </button>
      </div>

      {state.sources.length === 0 ? (
        <div className="sources-panel__empty">
          No library sources configured. Add a folder path above to start scanning for games.
        </div>
      ) : (
        <div className="sources-panel__list">
          {state.sources.map((source) => (
            <SourceItem
              key={source.id}
              source={source}
              onScan={handleScanOne}
              onRemove={handleRemove}
              scanActive={scanActive}
            />
          ))}
        </div>
      )}

      {state.lastWarnings.length > 0 && (
        <div className="sources-panel__warnings">
          <div className="sources-panel__warning-title">
            Nested source warning
          </div>
          {state.lastWarnings.map((w, i) => (
            <div key={i} className="sources-panel__warning-item">
              {w.relationship === "child"
                ? `"${w.new_path}" is inside existing source "${w.existing_path}"`
                : `"${w.new_path}" contains existing source "${w.existing_path}"`}
            </div>
          ))}
          <button
            className="sources-panel__btn"
            style={{ marginTop: "8px" }}
            onClick={() => dispatch({ type: "CLEAR_WARNINGS" })}
          >
            Dismiss
          </button>
        </div>
      )}

      {state.error && (
        <div className="sources-panel__error" role="alert">
          {state.error}
          <button
            className="sources-panel__btn"
            style={{ marginLeft: "8px" }}
            onClick={() => dispatch({ type: "CLEAR_ERROR" })}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function SourceItem({
  source,
  onScan,
  onRemove,
  scanActive,
}: {
  source: LibrarySource;
  onScan: (id: string) => void;
  onRemove: (id: string) => void;
  scanActive: boolean;
}) {
  const summary = source.last_scan_summary;

  return (
    <div className="source-item">
      <div className="source-item__info">
        <div className="source-item__label">{source.label}</div>
        <div className="source-item__path">{source.root_path}</div>
        {summary && (
          <div className="source-item__scan-info">
            Last scan: {summary.found} found, {summary.duplicates} duplicates
            {summary.warnings > 0 ? `, ${summary.warnings} warnings` : ""}
            {" - "}{summary.status}
          </div>
        )}
      </div>
      <div className="source-item__actions">
        <button
          className="source-item__btn"
          onClick={() => onScan(source.id)}
          disabled={scanActive}
        >
          Rescan
        </button>
        <button
          className="source-item__btn source-item__btn--danger"
          onClick={() => onRemove(source.id)}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
