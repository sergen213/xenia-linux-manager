import type { Dispatch } from "react";
import type {
  ConflictPlan,
  ImportApplyResult,
  ImportInspection,
  ImportWizardStep,
} from "../model/saveTypes";
import type { SavesAction } from "../state/savesStore";
import { SaveConflictPreview } from "./SaveConflictPreview";
import { BackupFailureDialog } from "./BackupFailureDialog";
import { SaveResultsPanel } from "./SaveResultsPanel";

interface SaveImportWizardProps {
  inspection: ImportInspection | null;
  inspectionLoading: boolean;
  conflictPlan: ConflictPlan | null;
  applyPending: boolean;
  wizardStep: ImportWizardStep;
  archivePath: string | null;
  backupFailureError: string | null;
  lastImportResult: ImportApplyResult | null;
  dispatch: Dispatch<SavesAction>;
  /** Open the file picker and inspect the chosen archive. */
  onChooseArchive: () => void;
  /** Build and show the conflict plan for the matched target game. */
  onReviewConflicts: () => void;
  /** Apply the plan; pass `true` to skip the pre-apply backup. */
  onApply: (force: boolean) => void;
  /** Abort the import and clean up staging. */
  onCancel: () => void;
}

const STEP_LABELS: { key: ImportWizardStep; label: string }[] = [
  { key: "inspect", label: "Inspect" },
  { key: "select_target", label: "Target" },
  { key: "conflict_review", label: "Review conflicts" },
  { key: "backup_warning", label: "Backup check" },
  { key: "applying", label: "Apply" },
  { key: "result", label: "Result" },
];

function stepIndex(step: ImportWizardStep): number {
  const idx = STEP_LABELS.findIndex((s) => s.key === step);
  return idx >= 0 ? idx : -1;
}

/**
 * Guided import wizard that walks through: inspect archive, detect
 * target game, review conflicts side-by-side, handle backup risk,
 * apply, and show per-item results.
 */
export function SaveImportWizard({
  inspection,
  inspectionLoading,
  conflictPlan,
  applyPending,
  wizardStep,
  archivePath,
  backupFailureError,
  lastImportResult,
  dispatch,
  onChooseArchive,
  onReviewConflicts,
  onApply,
  onCancel,
}: SaveImportWizardProps) {
  const currentIdx = stepIndex(wizardStep);

  if (wizardStep === "idle") {
    return (
      <div className="save-wizard">
        <h3>Import save archive</h3>
        <p className="saves-page__muted">
          Select a previously exported save archive (.zip) to begin the guided
          import process. The archive will be inspected before any changes are
          made to your local save data.
        </p>
        <div className="save-wizard__actions">
          <button type="button" onClick={onChooseArchive}>
            Choose archive to import
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="save-wizard">
      <h3>Import save archive</h3>

      <div className="save-wizard__step-indicator" role="navigation" aria-label="Import wizard steps">
        {STEP_LABELS.map((s, i) => {
          let className = "";
          if (i < currentIdx) className = "is-done";
          if (i === currentIdx) className = "is-active";
          return (
            <span key={s.key} className={className}>
              {i + 1}. {s.label}
            </span>
          );
        })}
      </div>

      {wizardStep === "inspect" && (
        <div className="save-wizard__info">
          {inspectionLoading ? (
            <p>Inspecting archive...</p>
          ) : archivePath ? (
            <p>Archive selected: <strong>{archivePath}</strong></p>
          ) : (
            <p>
              Waiting for archive selection. Choose a .zip file exported from
              this application.
            </p>
          )}
          {inspection && (
            <>
              <p>
                Source game: <strong>{inspection.manifest.game_title}</strong>{" "}
                ({inspection.manifest.items.length} items,{" "}
                {(inspection.manifest.total_size_bytes / 1024).toFixed(1)} KB)
              </p>
              {inspection.game_found && inspection.target_game_title && (
                <p>
                  Matched local game:{" "}
                  <strong>{inspection.target_game_title}</strong>
                </p>
              )}
              {!inspection.game_found && (
                <p>
                  No matching local game found. You will need to select a target
                  game manually.
                </p>
              )}
              {inspection.verification_warnings.length > 0 && (
                <ul className="save-wizard__warnings">
                  {inspection.verification_warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="save-wizard__actions">
                <button
                  type="button"
                  onClick={() =>
                    inspection.game_found
                      ? onReviewConflicts()
                      : dispatch({
                          type: "SET_IMPORT_WIZARD_STEP",
                          step: "select_target",
                        })
                  }
                >
                  {inspection.game_found ? "Review conflicts" : "Select target game"}
                </button>
                <button type="button" onClick={onCancel}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {wizardStep === "select_target" && (
        <div className="save-wizard__info">
          <p>
            The archive was exported from{" "}
            <strong>{inspection?.manifest.game_title ?? "unknown game"}</strong>{" "}
            but no matching game was found in your local library. Select a game
            to import into, or cancel to abort.
          </p>
          <div className="save-wizard__actions">
            <button type="button" onClick={onCancel}>
              Cancel import
            </button>
          </div>
        </div>
      )}

      {wizardStep === "conflict_review" && conflictPlan && (
        <SaveConflictPreview
          plan={conflictPlan}
          onAccept={() => onApply(false)}
          onCancel={onCancel}
        />
      )}

      {wizardStep === "conflict_review" && !conflictPlan && (
        <div className="save-wizard__info">
          <p>Loading conflict plan...</p>
        </div>
      )}

      {wizardStep === "backup_warning" && backupFailureError && (
        <BackupFailureDialog
          error={backupFailureError}
          onAcceptRisk={() => onApply(true)}
          onCancel={onCancel}
        />
      )}

      {wizardStep === "applying" && (
        <div className="save-wizard__info">
          <p>{applyPending ? "Applying save import..." : "Preparing to apply..."}</p>
        </div>
      )}

      {wizardStep === "result" && lastImportResult && (
        <SaveResultsPanel
          importResult={lastImportResult}
          onDismissImport={onCancel}
        />
      )}
    </div>
  );
}
