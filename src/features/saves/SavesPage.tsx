import { useLibrary } from "../library/state/libraryStore";
import { SaveImportWizard } from "./components/SaveImportWizard";
import { SaveResultsPanel } from "./components/SaveResultsPanel";
import "./SavesPage.css";

/**
 * Dedicated saves management surface.
 *
 * Provides the archive-first import workflow and displays recent
 * export/import results. Shares save state with game-detail quick
 * actions through the library store.
 */
export function SavesPage() {
  const { state, dispatch } = useLibrary();

  const hasImportResult = state.lastImportResult !== null;
  const hasExportResult = state.lastExportResult !== null;
  const showResults = hasImportResult || hasExportResult;
  const wizardActive = state.importWizardStep !== "idle";

  return (
    <div className="saves-page">
      <header className="saves-page__header">
        <div>
          <h2 className="saves-page__title">Saves</h2>
          <p className="saves-page__subtitle">
            Import and export save archives for your Xbox 360 library. Use the
            guided wizard below to inspect an archive, review conflicts, and
            apply changes safely.
          </p>
        </div>
      </header>

      <section className="saves-page__section">
        <SaveImportWizard
          inspection={state.importInspection}
          inspectionLoading={state.importInspectionLoading}
          conflictPlan={state.importConflictPlan}
          applyPending={state.importApplyPending}
          wizardStep={state.importWizardStep}
          archivePath={state.importArchivePath}
          backupFailureError={state.backupFailureError}
          backupFailureAccepted={state.backupFailureAccepted}
          lastImportResult={state.lastImportResult}
          dispatch={dispatch}
        />
      </section>

      {showResults && !wizardActive && (
        <section className="saves-page__section">
          <h3>Recent results</h3>
          <SaveResultsPanel
            exportResult={state.lastExportResult}
            importResult={state.lastImportResult}
            onDismissExport={() =>
              dispatch({ type: "EXPORT_COMPLETE", result: state.lastExportResult! })
            }
            onDismissImport={() =>
              dispatch({ type: "CLEAR_SAVE_STATE" })
            }
          />
        </section>
      )}

      {state.saveBackups.length > 0 && (
        <section className="saves-page__section">
          <h3>Backup archives</h3>
          <p className="saves-page__muted">
            Automatic backups created before import operations. These can be
            re-imported if you need to restore previous save state.
          </p>
          <ul className="saves-page__backup-list">
            {state.saveBackups.map((backup) => (
              <li key={backup.path} className="saves-page__backup-item">
                <strong>{backup.filename}</strong>
                <span className="saves-page__backup-path">{backup.path}</span>
                <span className="saves-page__backup-size">
                  {(backup.size_bytes / 1024).toFixed(1)} KB
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
