interface UnsavedProfileChangesDialogProps {
  /** Whether unsaved changes exist that would be lost. */
  visible: boolean;
  /** Called when the user confirms discarding changes. */
  onDiscard: () => void;
  /** Called when the user cancels navigation to keep editing. */
  onCancel: () => void;
  /** Called when the user wants to save before leaving. */
  onSave: () => Promise<void>;
  savePending: boolean;
}

/**
 * Modal dialog shown when the user attempts to navigate away from a profile
 * editor with unsaved changes. Offers three choices: save, discard, or cancel.
 */
export function UnsavedProfileChangesDialog({
  visible,
  onDiscard,
  onCancel,
  onSave,
  savePending,
}: UnsavedProfileChangesDialogProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="unsaved-dialog__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Unsaved profile changes"
    >
      <div className="unsaved-dialog">
        <h3 className="unsaved-dialog__title">Unsaved profile changes</h3>
        <p className="unsaved-dialog__body">
          You have unsaved changes to this profile. What would you like to do?
        </p>
        <div className="unsaved-dialog__actions">
          <button
            type="button"
            className="unsaved-dialog__save"
            disabled={savePending}
            onClick={() => void onSave()}
          >
            {savePending ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            className="unsaved-dialog__discard"
            onClick={onDiscard}
          >
            Discard changes
          </button>
          <button
            type="button"
            className="unsaved-dialog__cancel"
            onClick={onCancel}
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
