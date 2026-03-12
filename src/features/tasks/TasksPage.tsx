import "./TasksPage.css";

export function TasksPage() {
  return (
    <div className="tasks-page">
      <header className="tasks-page__header">
        <h2 className="tasks-page__title">Tasks</h2>
        <p className="tasks-page__subtitle">
          Monitor downloads, scans, and background operations
        </p>
      </header>

      <div className="tasks-page__empty-state">
        <p>No tasks running. Background operations will appear here.</p>
      </div>
    </div>
  );
}
