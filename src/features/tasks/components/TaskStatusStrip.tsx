import type { TasksState } from "../state/tasksStore";
import { selectRunningJobs, selectTaskSummary } from "../state/tasksStore";
import "./TaskStatusStrip.css";

interface TaskStatusStripProps {
  state: TasksState;
}

/**
 * Compact task summary surface for the sidebar/dashboard.
 * Shows a one-line summary of active, completed, and failed job counts
 * with a mini progress bar for any running job.
 */
export function TaskStatusStrip({ state }: TaskStatusStripProps) {
  const summary = selectTaskSummary(state);
  const running = selectRunningJobs(state);
  const activeJob = running[0] ?? null;

  if (!state.initialized) {
    return null;
  }

  return (
    <div className="task-strip" data-testid="task-status-strip">
      {activeJob ? (
        <div className="task-strip__active">
          <div className="task-strip__active-label">{activeJob.label}</div>
          <div className="task-strip__progress-bar">
            <div
              className="task-strip__progress-fill"
              style={{ width: `${activeJob.progress ?? 0}%` }}
            />
          </div>
          {summary.running > 1 && (
            <span className="task-strip__extra">
              +{summary.running - 1} more
            </span>
          )}
        </div>
      ) : (
        <div className="task-strip__idle">
          {summary.total === 0 ? (
            <span className="task-strip__text">No tasks</span>
          ) : (
            <span className="task-strip__text">
              {summary.completed > 0 && `${summary.completed} done`}
              {summary.failed > 0 &&
                `${summary.completed > 0 ? ", " : ""}${summary.failed} failed`}
              {summary.interrupted > 0 &&
                `${summary.completed > 0 || summary.failed > 0 ? ", " : ""}${summary.interrupted} interrupted`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
