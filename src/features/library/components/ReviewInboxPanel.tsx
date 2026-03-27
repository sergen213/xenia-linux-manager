import type { DuplicateResolutionKind, ReviewInboxPayload } from "../model/libraryTypes";
import { DuplicateResolutionTable } from "./DuplicateResolutionTable";

interface ReviewInboxPanelProps {
  reviewInbox: ReviewInboxPayload | null;
  onSelectReviewGame: (gameId: string | null) => void;
  onResolve: (reviewId: string, kind: DuplicateResolutionKind) => Promise<void>;
}

export function ReviewInboxPanel({
  reviewInbox,
  onSelectReviewGame,
  onResolve,
}: ReviewInboxPanelProps) {
  if (!reviewInbox) {
    return <div className="library-page__empty-state">Loading review inbox...</div>;
  }

  return (
    <section className="review-inbox">
      <header className="review-inbox__header">
        <div>
          <h3>Review inbox</h3>
          <p>
            {reviewInbox.items.length} items, {reviewInbox.duplicate_count} duplicates,{" "}
            {reviewInbox.low_confidence_count} low-confidence
          </p>
        </div>
      </header>

      {reviewInbox.queue.length > 0 && (
        <div className="review-inbox__queue">
          {reviewInbox.queue.map((item) => (
            <button
              key={item.review_id}
              type="button"
              className="review-inbox__queue-item"
              onClick={() => onSelectReviewGame(item.game_id)}
            >
              <strong>{item.title}</strong>
              <span>{item.reason}</span>
            </button>
          ))}
        </div>
      )}

      <DuplicateResolutionTable items={reviewInbox.items} onResolve={onResolve} />
    </section>
  );
}
