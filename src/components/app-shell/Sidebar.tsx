import { NavLink } from "react-router-dom";
import { Gamepad2, Save, ListChecks, Settings, type LucideIcon } from "lucide-react";
import { getSidebarRoutes, type AppRoute } from "../../app/router";
import { useTasks, selectRunningJobs } from "../../features/tasks/state/tasksStore";
import { TaskStatusStrip } from "../../features/tasks/components/TaskStatusStrip";
import { StatusBar } from "./StatusBar";
import "./Sidebar.css";

const iconMap: Record<string, LucideIcon> = {
  library: Gamepad2,
  save: Save,
  tasks: ListChecks,
  settings: Settings,
};

function SidebarLink({ route }: { route: AppRoute }) {
  const Icon = iconMap[route.icon];
  return (
    <NavLink
      to={route.path}
      end={route.path === "/"}
      className={({ isActive }) =>
        `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
      }
    >
      <span className="sidebar__icon">
        {Icon ? <Icon size={18} strokeWidth={2} aria-hidden /> : null}
      </span>
      <span className="sidebar__label">{route.label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const routes = getSidebarRoutes();
  const topRoutes = routes.filter((r) => r.placement === "top");
  const bottomRoutes = routes.filter((r) => r.placement === "bottom");
  const { state: tasksState } = useTasks();
  const hasActiveJob = selectRunningJobs(tasksState).length > 0;

  return (
    <aside className="sidebar" role="navigation" aria-label="Main navigation">
      <div className="sidebar__header">
        <h1 className="sidebar__title">Xenia Manager</h1>
      </div>

      <nav className="sidebar__nav">
        {topRoutes.map((route) => (
          <SidebarLink key={route.path} route={route} />
        ))}
      </nav>

      <div className="sidebar__footer">
        <nav className="sidebar__nav sidebar__nav--bottom">
          {bottomRoutes.map((route) => (
            <SidebarLink key={route.path} route={route} />
          ))}
        </nav>
        {hasActiveJob && <TaskStatusStrip state={tasksState} />}
        <StatusBar />
      </div>
    </aside>
  );
}
