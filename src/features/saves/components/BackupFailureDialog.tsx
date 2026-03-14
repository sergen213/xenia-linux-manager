interface BackupFailureDialogProps {
  error: string;
  accepted: boolean;
  onAcceptRisk: () => void;
  onCancel: () => void;
}

/**
 * Shown when a pre-import backup fails. The user must explicitly
 * acknowledge the risk before proceeding without a safety backup.
 */
export function BackupFailureDialog({
  error,
  accepted,
  onAcceptRisk,
  onCancel,
}: BackupFailureDialogProps) {
  return (
    <div className="backup-failure-dialog">
      <p className="backup-failure-dialog__warning">
        Backup creation failed
      </p>
      <p>
        An automatic backup of your current save state could not be created
        before applying this import. The import can still proceed, but you will
        not have a safety copy to restore if something goes wrong.
      </p>
      <p>
        <strong>Error detail:</strong> {error}
      </p>
      {!accepted && (
        <p>
          If you choose to continue without a backup, any existing save files
          that are overwritten cannot be recovered automatically. You may want to
          manually copy your save directory before proceeding.
        </p>
      )}
      <div className="save-wizard__actions">
        {!accepted && (
          <button type="button" onClick={onAcceptRisk}>
            I understand the risk -- proceed without backup
          </button>
        )}
        {accepted && (
          <p>
            Risk acknowledged. The import will proceed without a backup.
          </p>
        )}
        <button type="button" onClick={onCancel}>
          Cancel import
        </button>
      </div>
    </div>
  );
}
