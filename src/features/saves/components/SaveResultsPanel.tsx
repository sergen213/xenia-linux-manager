import type { ExportResult, ImportApplyResult } from "../../library/model/saveTypes";

interface SaveResultsPanelProps {
  exportResult: ExportResult | null;
  importResult: ImportApplyResult | null;
  onDismissExport?: () => void;
  onDismissImport?: () => void;
}

/**
 * Detailed result surfaces for export and import operations.
 *
 * Shows:
 * - Archive location and reveal-folder cue for exports
 * - Backup artifact location when a pre-import backup was created
 * - Per-item outcomes for imports (success, failed, skipped)
 * - Partial-success messaging with individual item explanations
 */
export function SaveResultsPanel({
  exportResult,
  importResult,
  onDismissExport,
  onDismissImport,
}: SaveResultsPanelProps) {
  return (
    <div className="save-results">
      {exportResult && (
        <div>
          <h4>Export complete</h4>
          <div className="save-results__artifact">
            <strong>{exportResult.archive_filename}</strong>
            <span className="save-results__artifact-path">
              {exportResult.archive_path}
            </span>
            <span className="saves-page__muted">
              {exportResult.items_exported} item
              {exportResult.items_exported !== 1 ? "s" : ""} exported (
              {(exportResult.total_size_bytes / 1024).toFixed(1)} KB)
            </span>
          </div>
          <p className="saves-page__muted">
            The archive is a standard .zip file and can be re-imported on any
            machine running this application. Open the containing folder to
            locate the file.
          </p>
          {onDismissExport && (
            <div className="save-wizard__actions">
              <button type="button" onClick={onDismissExport}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {importResult && (
        <div>
          <h4>Import result: {importResult.game_title}</h4>

          <div className="save-results__summary">
            <div className="save-results__stat">
              <strong>{importResult.success_count}</strong>
              <span>Succeeded</span>
            </div>
            {importResult.failed_count > 0 && (
              <div className="save-results__stat">
                <strong>{importResult.failed_count}</strong>
                <span>Failed</span>
              </div>
            )}
            {importResult.skipped_count > 0 && (
              <div className="save-results__stat">
                <strong>{importResult.skipped_count}</strong>
                <span>Skipped</span>
              </div>
            )}
          </div>

          {importResult.backup_path && (
            <div className="save-results__artifact">
              <strong>Backup created</strong>
              <span className="save-results__artifact-path">
                {importResult.backup_path}
              </span>
              <span className="saves-page__muted">
                Your previous save state was archived before the import was
                applied. This backup can be re-imported if you need to restore
                the original state.
              </span>
            </div>
          )}

          {!importResult.backup_path && (
            <p className="saves-page__muted">
              No backup was created for this import. If the import replaced
              existing files, those changes cannot be automatically reversed.
            </p>
          )}

          <ul className="save-results__items">
            {importResult.items.map((item) => (
              <li
                key={item.archive_path}
                className={`save-results__item${
                  item.status === "failed"
                    ? " save-results__item--failed"
                    : item.status === "skipped"
                      ? " save-results__item--skipped"
                      : ""
                }`}
              >
                <span>{item.label}</span>
                <span>
                  {item.status === "success"
                    ? "OK"
                    : item.status === "failed"
                      ? "Failed"
                      : "Skipped"}
                </span>
                {item.detail && (
                  <span className="save-results__item-detail">
                    {item.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {importResult.failed_count > 0 && (
            <p className="saves-page__muted">
              Some items could not be imported. Review the per-item details
              above. Failed items were not applied to your local save directory
              and your existing data for those items is unchanged.
            </p>
          )}

          {onDismissImport && (
            <div className="save-wizard__actions">
              <button type="button" onClick={onDismissImport}>
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
