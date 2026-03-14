import type { ConflictAction, ConflictPlan } from "../../library/model/saveTypes";

interface SaveConflictPreviewProps {
  plan: ConflictPlan;
  onAccept: () => void;
  onCancel: () => void;
}

function actionBadgeClass(action: ConflictAction): string {
  switch (action) {
    case "new":
      return "save-conflict-preview__action-badge save-conflict-preview__action-badge--new";
    case "replace":
      return "save-conflict-preview__action-badge save-conflict-preview__action-badge--replace";
    case "rename_keep_both":
      return "save-conflict-preview__action-badge save-conflict-preview__action-badge--rename";
    case "skip":
    case "unresolved":
      return "save-conflict-preview__action-badge save-conflict-preview__action-badge--skip";
  }
}

function actionLabel(action: ConflictAction): string {
  switch (action) {
    case "new":
      return "New";
    case "replace":
      return "Replace";
    case "rename_keep_both":
      return "Keep both";
    case "skip":
      return "Skip";
    case "unresolved":
      return "Unresolved";
  }
}

function policyDescription(policy: string): string {
  switch (policy) {
    case "replace_all":
      return "Replace all -- existing local files that conflict with the archive will be overwritten. A backup of your current save state will be created before any changes are applied.";
    case "keep_both_if_possible":
      return "Keep both if possible -- conflicting items will be renamed so both the local and imported versions are preserved side by side.";
    case "cancel":
      return "Cancel -- no changes will be made.";
    default:
      return policy;
  }
}

/**
 * Side-by-side conflict summary showing per-item classifications,
 * the selected policy, and cautious overwrite messaging.
 *
 * Only offers the three approved conflict actions:
 * - Replace all
 * - Keep both if possible
 * - Cancel
 */
export function SaveConflictPreview({
  plan,
  onAccept,
  onCancel,
}: SaveConflictPreviewProps) {
  const replaceCount = plan.items.filter((i) => i.action === "replace").length;
  const newCount = plan.items.filter((i) => i.action === "new").length;
  const keepBothCount = plan.items.filter(
    (i) => i.action === "rename_keep_both",
  ).length;
  const skipCount = plan.items.filter((i) => i.action === "skip").length;

  return (
    <div className="save-conflict-preview">
      <div className="save-conflict-preview__header">
        <div>
          <h4>
            Conflict review: {plan.source_game_title} into{" "}
            {plan.game_title}
          </h4>
          {plan.has_conflicts && (
            <p className="saves-page__muted">
              {replaceCount} item{replaceCount !== 1 ? "s" : ""} will be
              overwritten. Review each item below before proceeding.
            </p>
          )}
          {!plan.has_conflicts && (
            <p className="saves-page__muted">
              No conflicts detected. All items are new and can be imported
              safely.
            </p>
          )}
        </div>
      </div>

      <div className="save-wizard__info">
        <strong>Selected policy:</strong>{" "}
        {policyDescription(plan.policy)}
      </div>

      <div className="save-results__summary">
        {newCount > 0 && (
          <div className="save-results__stat">
            <strong>{newCount}</strong>
            <span>New</span>
          </div>
        )}
        {replaceCount > 0 && (
          <div className="save-results__stat">
            <strong>{replaceCount}</strong>
            <span>Replace</span>
          </div>
        )}
        {keepBothCount > 0 && (
          <div className="save-results__stat">
            <strong>{keepBothCount}</strong>
            <span>Keep both</span>
          </div>
        )}
        {skipCount > 0 && (
          <div className="save-results__stat">
            <strong>{skipCount}</strong>
            <span>Skip</span>
          </div>
        )}
      </div>

      <ul className="save-conflict-preview__items">
        {plan.items.map((item) => (
          <li
            key={item.archive_path}
            className={`save-conflict-preview__item${
              item.action === "replace"
                ? " save-conflict-preview__item--replace"
                : ""
            }`}
          >
            <div>
              <strong>{item.label}</strong>
              <br />
              <span className="saves-page__muted">{item.category}</span>
            </div>
            <span className={actionBadgeClass(item.action)}>
              {actionLabel(item.action)}
            </span>
            {item.explanation && (
              <span className="save-conflict-preview__explanation">
                {item.explanation}
              </span>
            )}
          </li>
        ))}
      </ul>

      {plan.has_conflicts && replaceCount > 0 && (
        <div className="backup-failure-dialog">
          <p className="backup-failure-dialog__warning">
            Caution: {replaceCount} existing save{" "}
            {replaceCount === 1 ? "file" : "files"} will be permanently
            overwritten. A backup of your current state will be created
            automatically before the import proceeds.
          </p>
        </div>
      )}

      <div className="save-wizard__actions">
        {plan.policy !== "cancel" && (
          <button type="button" onClick={onAccept}>
            {plan.policy === "replace_all"
              ? "Replace all"
              : "Keep both if possible"}
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
