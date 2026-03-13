import { useTasks } from "./state/tasksStore";
import {
  selectRunningJobs,
  selectHistoryJobs,
  selectInterruptedJobs,
} from "./state/tasksStore";
import { TaskHistoryCard } from "./components/TaskHistoryCard";
import type { Job } from "./model/taskTypes";
import "./TasksPage.css";

export function TasksPage() {
  const { state, dispatch } = useTasks();
  const running = selectRunningJobs(state);
  const history = selectHistoryJobs(state);
  const interrupted = selectInterruptedJobs(state);

  const handleClearHistory = () => {
    dispatch({ type: "CLEAR_HISTORY" });
  };

  const handleRetry = (_job: Job) => {
    // Retry handler is generic -- later install/scan plans will hook
    // real job handlers into this callback.
    // For now, just dismiss the interrupted notice.
    dispatch({ type: "DISMISS_INTERRUPTED" });
  };

  return (
    <div className="tasks-page">
      <header className="tasks-page__header">
        <h2 className="tasks-page__title">Tasks</h2>
        <p className="tasks-page__subtitle">
          Monitor downloads, scans, and background operations
        </p>
      </header>

      {/* Interrupted jobs banner */}
      {interrupted.length > 0 && (
        <div className="tasks-page__interrupted-banner" data-testid="interrupted-banner">
          <p>
            {interrupted.length} job{interrupted.length !== 1 ? "s were" : " was"}{" "}
            interrupted when the application closed unexpectedly.
          </p>
        </div>
      )}

      {/* Active jobs section */}
      {running.length > 0 && (
        <section className="tasks-page__section">
          <h3 className="tasks-page__section-title">
            Active ({running.length})
          </h3>
          {running.map((job) => (
            <div key={job.id} className="tasks-page__active-job" data-testid={`active-job-${job.id}`}>
              <div className="tasks-page__active-header">
                <span className="tasks-page__active-label">{job.label}</span>
                <span className="tasks-page__active-progress">
                  {job.progress ?? 0}%
                </span>
              </div>
              <div className="tasks-page__progress-bar">
                <div
                  className="tasks-page__progress-fill"
                  style={{ width: `${job.progress ?? 0}%` }}
                />
              </div>
              {job.logs.length > 0 && (
                <div className="tasks-page__active-log">
                  {job.logs[job.logs.length - 1].message}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Task history section */}
      <section className="tasks-page__section">
        <div className="tasks-page__section-header">
          <h3 className="tasks-page__section-title">
            History ({history.length})
          </h3>
          {history.length > 0 && (
            <button
              className="tasks-page__clear-btn"
              onClick={handleClearHistory}
              data-testid="clear-history-btn"
            >
              Clear
            </button>
          )}
        </div>

        {history.length === 0 && running.length === 0 ? (
          <div className="tasks-page__empty-state">
            <p>No tasks running. Background operations will appear here.</p>
          </div>
        ) : history.length === 0 ? null : (
          <div className="tasks-page__history-list">
            {history.map((job) => (
              <TaskHistoryCard
                key={job.id}
                job={job}
                onRetry={job.status === "interrupted" ? handleRetry : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
