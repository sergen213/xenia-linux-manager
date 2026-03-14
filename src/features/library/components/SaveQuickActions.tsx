import type { ExportPreflight, ExportResult } from "../model/saveTypes";
import { SaveExportDialog } from "../../saves/components/SaveExportDialog";

interface SaveQuickActionsProps {
  gameId: string;
  gameTitle: string;
  open: boolean;
  exportPreflight: ExportPreflight | null;
  exportPreflightLoading: boolean;
  exportPending: boolean;
  lastExportResult: ExportResult | null;
  onToggle: () => void;
  onLoadPreflight: () => void;
  onExport: (selectedLabels: string[] | null) => void;
  onImportNavigate: () => void;
  onClearResults: () => void;
}

/**
 * Quick save actions embedded in the game detail panel.
 *
 * Provides fast per-title export with item selection plus a link
 * to navigate into the full dedicated saves route for archive-first
 * imports. Keeps the detail workflow lightweight while offering
 * immediate access to common save operations.
 */
export function SaveQuickActions({
  gameTitle,
  open,
  exportPreflight,
  exportPreflightLoading,
  exportPending,
  lastExportResult,
  onToggle,
  onLoadPreflight,
  onExport,
  onImportNavigate,
  onClearResults,
}: SaveQuickActionsProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="save-quick-actions">
      <div className="save-quick-actions__row">
        <button
          type="button"
          onClick={onLoadPreflight}
          disabled={exportPreflightLoading}
        >
          {exportPreflightLoading ? "Loading..." : "Export saves"}
        </button>
        <button type="button" onClick={onImportNavigate}>
          Import archive
        </button>
        <button type="button" onClick={onToggle}>
          Close
        </button>
      </div>

      {exportPreflight && !lastExportResult && (
        <SaveExportDialog
          preflight={exportPreflight}
          exportPending={exportPending}
          onExport={onExport}
          onCancel={onClearResults}
        />
      )}

      {lastExportResult && (
        <div className="save-results__artifact">
          <strong>Export complete: {lastExportResult.archive_filename}</strong>
          <span className="save-results__artifact-path">
            {lastExportResult.archive_path}
          </span>
          <span className="saves-page__muted">
            {lastExportResult.items_exported} item
            {lastExportResult.items_exported !== 1 ? "s" : ""} exported (
            {(lastExportResult.total_size_bytes / 1024).toFixed(1)} KB).
            Open the containing folder to locate the archive.
          </span>
          <div className="save-wizard__actions">
            <button type="button" onClick={onClearResults}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
