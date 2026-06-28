import { useLocation, useNavigate } from "react-router-dom";
import { useTasks, selectRunningJobs } from "../../features/tasks/state/tasksStore";
import "./BladeNav.css";

const TABS = [
  { label: "Home", path: "/home" },
  { label: "Library", path: "/" },
  { label: "Saves", path: "/saves" },
  { label: "Settings", path: "/settings" },
];

export function BladeNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { state: tasksState } = useTasks();
  const running = selectRunningJobs(tasksState).length;

  return (
    <nav className="blade-nav" aria-label="Primary navigation">
      {TABS.map((tab) => {
        const active = tab.path === pathname;
        return (
          <button
            key={tab.path}
            type="button"
            className={`blade-nav__tab ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => navigate(tab.path)}
          >
            {tab.label}
          </button>
        );
      })}
      <div className="blade-nav__spacer" />
      {running > 0 && (
        <button
          type="button"
          className="blade-nav__tasks"
          onClick={() => navigate("/tasks")}
          title="View running tasks"
        >
          <span className="blade-nav__tasks-dot" />
          {running} running
        </button>
      )}
    </nav>
  );
}
