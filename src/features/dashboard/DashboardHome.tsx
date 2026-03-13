import { useTasks } from "../tasks/state/tasksStore";
import { TaskStatusStrip } from "../tasks/components/TaskStatusStrip";
import "./DashboardHome.css";

export function DashboardHome() {
  const { state: tasksState } = useTasks();

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
        <h3 className="dashboard__section-title">Getting Started</h3>
        <div className="dashboard__steps">
          <div className="dashboard__step">
            <span className="dashboard__step-number">1</span>
            <div>
              <p className="dashboard__step-title">Configure paths</p>
              <p className="dashboard__step-desc">
                Set where Xenia and your game library live on disk.
              </p>
            </div>
          </div>
          <div className="dashboard__step">
            <span className="dashboard__step-number">2</span>
            <div>
              <p className="dashboard__step-title">Install Xenia</p>
              <p className="dashboard__step-desc">
                Download and extract the Linux Canary build.
              </p>
            </div>
          </div>
          <div className="dashboard__step">
            <span className="dashboard__step-number">3</span>
            <div>
              <p className="dashboard__step-title">Add your games</p>
              <p className="dashboard__step-desc">
                Point the manager at your game folders to build your library.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard__section">
        <h3 className="dashboard__section-title">Task Activity</h3>
        <TaskStatusStrip state={tasksState} />
      </section>

      <section className="dashboard__section">
        <h3 className="dashboard__section-title">Recent Activity</h3>
        <div className="dashboard__empty-state">
          <p>No activity yet. Set up your paths in Settings to get started.</p>
        </div>
      </section>
    </div>
  );
}
