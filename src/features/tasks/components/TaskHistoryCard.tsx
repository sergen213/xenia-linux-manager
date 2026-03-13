import type { Job } from "../model/taskTypes";
import { statusLabel, statusModifier } from "../model/taskTypes";
import "./TaskHistoryCard.css";

interface TaskHistoryCardProps {
  job: Job;
  /** Called when the user wants to retry an interrupted job. */
  onRetry?: (job: Job) => void;
}

/**
 * Persistent card showing a completed, failed, or interrupted job.
 * Displays status, label, duration, and expandable log entries.
 */
export function TaskHistoryCard({ job, onRetry }: TaskHistoryCardProps) {
  const duration = formatDuration(job.created_at, job.finished_at);

  return (
    <div
      className={`task-card task-card--${statusModifier(job.status)}`}
      data-testid={`task-card-${job.id}`}
    >
      <div className="task-card__header">
        <span className={`task-card__status task-card__status--${statusModifier(job.status)}`}>
          {statusLabel(job.status)}
        </span>
        <span className="task-card__label">{job.label}</span>
        {duration && <span className="task-card__duration">{duration}</span>}
      </div>

      {job.error && (
        <div className="task-card__error">{job.error}</div>
      )}

      {job.status === "interrupted" && onRetry && (
        <div className="task-card__interrupted-notice">
          <p>This job was interrupted when the application closed unexpectedly.</p>
          <button
            className="task-card__retry-btn"
            onClick={() => onRetry(job)}
          >
            Retry
          </button>
        </div>
      )}

      {job.logs.length > 0 && (
        <details className="task-card__logs">
          <summary className="task-card__logs-toggle">
            Logs ({job.logs.length} entries)
          </summary>
          <ul className="task-card__log-list">
            {job.logs.map((entry, i) => (
              <li
                key={i}
                className={`task-card__log-entry task-card__log-entry--${entry.level}`}
              >
                <span className="task-card__log-time">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className="task-card__log-msg">{entry.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function formatDuration(start: number, end: number | null): string | null {
  if (!end) return null;
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}
