import "./DashboardHome.css";

export function DashboardHome() {
  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h2 className="dashboard__title">Dashboard</h2>
        <p className="dashboard__subtitle">
          Your Xbox 360 library at a glance
        </p>
      </header>

      <div className="dashboard__grid">
        <div className="dashboard__card">
          <h3 className="dashboard__card-title">Library</h3>
          <p className="dashboard__card-value">--</p>
          <p className="dashboard__card-label">Games detected</p>
        </div>

        <div className="dashboard__card">
          <h3 className="dashboard__card-title">Xenia</h3>
          <p className="dashboard__card-value">--</p>
          <p className="dashboard__card-label">Not installed</p>
        </div>

        <div className="dashboard__card">
          <h3 className="dashboard__card-title">Tasks</h3>
          <p className="dashboard__card-value">0</p>
          <p className="dashboard__card-label">Active tasks</p>
        </div>
      </div>

      <section className="dashboard__section">
        <h3 className="dashboard__section-title">Recent Activity</h3>
        <div className="dashboard__empty-state">
          <p>No activity yet. Set up your paths in Settings to get started.</p>
        </div>
      </section>
    </div>
  );
}
