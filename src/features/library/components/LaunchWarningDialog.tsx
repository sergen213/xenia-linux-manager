import type { LaunchPreflight } from "../model/libraryTypes";

interface LaunchWarningDialogProps {
  preflight: LaunchPreflight | null;
  onConfirm: () => Promise<void>;
}

export function LaunchWarningDialog({
  preflight,
  onConfirm,
}: LaunchWarningDialogProps) {
  if (!preflight?.requires_confirmation) {
    return null;
  }

  return (
    <div className="launch-warning-dialog" role="dialog" aria-label="Launch warning">
      <h4>Launch warning</h4>
      <ul>
        {preflight.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <button type="button" onClick={() => void onConfirm()}>
        Launch anyway
      </button>
    </div>
  );
}
