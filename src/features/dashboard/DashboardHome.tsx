import { useMemo } from "react";
import { useTasks } from "../tasks/state/tasksStore";
import { useLibrary } from "../library/state/libraryStore";
import { TaskStatusStrip } from "../tasks/components/TaskStatusStrip";
import { XeniaLifecycleCard } from "../xenia/components/XeniaLifecycleCard";
import "./DashboardHome.css";

export function DashboardHome() {
  const { state: tasksState } = useTasks();
  const { state: libraryState } = useLibrary();

  const libraryCounts = useMemo(() => {
    let found = 0;
    let sources = libraryState.sources.length;
    for (const cat of libraryState.catalogs) {
      if (cat.last_scan_summary) {
        found += cat.last_scan_summary.found;
      }
    }
    return { found, sources };
  }, [libraryState.catalogs, libraryState.sources]);

  const lastScanStatus = useMemo(() => {
    let latest: { status: string; completedAt: number } | null = null;
    for (const cat of libraryState.catalogs) {
      if (
        cat.last_scan_summary &&
        (!latest || cat.last_scan_summary.completed_at > latest.completedAt)
      ) {
        latest = {
          status: cat.last_scan_summary.status,
          completedAt: cat.last_scan_summary.completed_at,
        };
      }
    }
    return latest;
  }, [libraryState.catalogs]);

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
          <p className="dashboard__card-value">{libraryCounts.found}</p>
          <p className="dashboard__card-label">
            Games detected
            {libraryCounts.sources > 0
              ? ` across ${libraryCounts.sources} source${libraryCounts.sources !== 1 ? "s" : ""}`
              : ""}
          </p>
          {lastScanStatus && (
            <p className="dashboard__card-meta">
              Last scan: {lastScanStatus.status}
            </p>
          )}
        </div>

        <XeniaLifecycleCard />

        <div className="dashboard__card">
          <h3 className="dashboard__card-title">Tasks</h3>
          <p className="dashboard__card-value">0</p>
          <p className="dashboard__card-label">Active tasks</p>
        </div>
      </div>

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
