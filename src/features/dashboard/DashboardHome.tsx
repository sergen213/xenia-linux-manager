import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTasks } from "../tasks/state/tasksStore";
import { useLibrary } from "../library/state/libraryStore";
import { TaskStatusStrip } from "../tasks/components/TaskStatusStrip";
import { XeniaLifecycleCard } from "../xenia/components/XeniaLifecycleCard";
import "./DashboardHome.css";

export function DashboardHome() {
  const navigate = useNavigate();
  const { state: tasksState } = useTasks();
  const { state: libraryState } = useLibrary();

  const libraryCounts = useMemo(() => {
    return {
      found: libraryState.browse?.cards.length ?? 0,
      sources: libraryState.sources.length,
      review: libraryState.reviewInbox?.items.length ?? 0,
      running: libraryState.browse?.cards.filter(
        (card) =>
          libraryState.selectedGame?.game_id === card.game_id &&
          libraryState.selectedGame.running_session_started_at,
      ).length ?? 0,
    };
  }, [
    libraryState.browse,
    libraryState.reviewInbox,
    libraryState.selectedGame,
    libraryState.sources.length,
  ]);

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
        <button
          type="button"
          className="dashboard__card dashboard__card--interactive"
          onClick={() => navigate("/library")}
        >
          <h3 className="dashboard__card-title">Library</h3>
          <p className="dashboard__card-value">{libraryCounts.found}</p>
          <p className="dashboard__card-label">
            Resolved games
            {libraryCounts.sources > 0
              ? ` across ${libraryCounts.sources} source${libraryCounts.sources !== 1 ? "s" : ""}`
              : ""}
          </p>
          {lastScanStatus && (
            <p className="dashboard__card-meta">
              Last scan: {lastScanStatus.status}
            </p>
          )}
          {libraryCounts.review > 0 && (
            <p className="dashboard__card-meta">
              {libraryCounts.review} item{libraryCounts.review !== 1 ? "s" : ""} still need review
            </p>
          )}
        </button>

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
