import type { DuplicateResolutionKind, ReviewInboxItem } from "../model/libraryTypes";

interface DuplicateResolutionTableProps {
  items: ReviewInboxItem[];
  onResolve: (reviewId: string, kind: DuplicateResolutionKind) => Promise<void>;
}

export function DuplicateResolutionTable({
  items,
  onResolve,
}: DuplicateResolutionTableProps) {
  if (items.length === 0) {
    return <p className="review-inbox__empty">No review items right now.</p>;
  }

  return (
    <table className="duplicate-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Reason</th>
          <th>Source</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.review_id}>
            <td>{item.title}</td>
            <td>{item.reason}</td>
            <td>{item.source_label}</td>
            <td className="duplicate-table__actions">
              <button type="button" onClick={() => onResolve(item.review_id, "keep_primary")}>
                Keep primary
              </button>
              <button type="button" onClick={() => onResolve(item.review_id, "merge")}>
                Merge
              </button>
              <button
                type="button"
                onClick={() => onResolve(item.review_id, "dismiss_false_duplicate")}
              >
                Dismiss
              </button>
              <button type="button" onClick={() => onResolve(item.review_id, "leave_flagged")}>
                Leave flagged
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
