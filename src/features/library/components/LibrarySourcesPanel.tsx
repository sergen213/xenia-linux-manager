import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "../api/libraryClient";
import { useLibrary } from "../state/libraryStore";
import { useSettings } from "../../settings/state/settingsStore";
import {
  addLibrarySource,
  removeLibrarySource,
  startSourceScan,
  scanAllSources,
  getLibraryStatus,
  checkPatchesStatus,
  deployGamePatches,
} from "../api/libraryClient";
import type { PatchesVersionInfo } from "../api/libraryClient";
import type { LibrarySource } from "../model/libraryTypes";
import "./LibrarySourcesPanel.css";

interface LibrarySourcesPanelProps {
  onRefreshLibrary?: () => void | Promise<void>;
  appDataPath?: string;
}

export function LibrarySourcesPanel({ onRefreshLibrary, appDataPath }: LibrarySourcesPanelProps = {}) {
  const { state, dispatch } = useLibrary();
  const { state: settingsState } = useSettings();
  const [newPath, setNewPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [patchStatus, setPatchStatus] = useState<PatchesVersionInfo | null>(null);
  const [deploying, setDeploying] = useState(false);

  const libPath = settingsState.settings?.library_metadata_path ?? "";

  // Check game patches deploy status on mount.
  useEffect(() => {
    if (!appDataPath) return;
    checkPatchesStatus(appDataPath)
      .then(setPatchStatus)
      .catch(() => {
        // best-effort
      });
  }, [appDataPath]);

  const handleDeployPatches = useCallback(async () => {
    if (!appDataPath) return;
    setDeploying(true);
    try {
      await deployGamePatches(appDataPath);
      const status = await checkPatchesStatus(appDataPath);
      setPatchStatus(status);
    } catch {
      // best-effort
    } finally {
      setDeploying(false);
    }
  }, [appDataPath]);

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

      // Auto-scan the newly added source.
      try {
        await startSourceScan(libPath, result.source.id);
        await refreshStatus();
      } catch {
        // Scan failure is non-critical; source was still added.
      }
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAdding(false);
    }
  }, [newPath, libPath, dispatch, refreshStatus]);

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select game folder",
      });
      if (selected) {
        setNewPath(selected as string);
      }
    } catch {
      // User cancelled or dialog error — ignore.
    }
  }, []);

  const handleRemove = useCallback(
    async (sourceId: string) => {
      if (!libPath) return;
      try {
        await removeLibrarySource(libPath, sourceId);
        dispatch({ type: "REMOVE_SOURCE", sourceId });
        // Refresh the browse view so removed games disappear from the grid.
        if (onRefreshLibrary) {
          void onRefreshLibrary();
        }
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [libPath, dispatch, onRefreshLibrary],
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
          className="sources-panel__btn"
          onClick={handleBrowse}
          disabled={adding}
          title="Browse for folder"
        >
          Browse
        </button>
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

      {appDataPath && (
        <div className="sources-panel__patches" style={{ marginTop: "24px", padding: "12px", border: "1px solid var(--border-color, #444)", borderRadius: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span className="sources-panel__title">Game Patches</span>
            {patchStatus?.update_available && (
              <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: "4px", background: "var(--accent-color, #f59e0b)", color: "#000", fontWeight: 600 }}>
                Update Available
              </span>
            )}
          </div>
          {patchStatus ? (
            <div style={{ fontSize: "0.85rem", marginBottom: "8px" }}>
              {patchStatus.patch_count > 0 ? (
                <>
                  <div>{patchStatus.patch_count} patch files installed</div>
                  {patchStatus.local_version && <div>Version: {patchStatus.local_version}</div>}
                </>
              ) : (
                <div>Not installed</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: "0.85rem", marginBottom: "8px", opacity: 0.6 }}>Checking status…</div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="sources-panel__btn sources-panel__btn--primary"
              onClick={handleDeployPatches}
              disabled={deploying}
            >
              {deploying
                ? "Downloading…"
                : patchStatus && patchStatus.patch_count > 0
                  ? "Update Patches"
                  : "Download Patches"}
            </button>
            {patchStatus && patchStatus.patch_count > 0 && (
              <button
                className="sources-panel__btn"
                onClick={() => {
                  void openPath(patchStatus.patches_dir, [patchStatus.patches_dir]);
                }}
                title={patchStatus.patches_dir}
              >
                Open Location
              </button>
            )}
          </div>
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
