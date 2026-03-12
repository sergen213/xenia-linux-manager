import { NavLink } from "react-router-dom";
import { getSidebarRoutes } from "../../app/router";
import "./Sidebar.css";

const iconMap: Record<string, string> = {
  dashboard: "\u2302",
  library: "\u25A6",
  tasks: "\u2630",
  settings: "\u2699",
};

export function Sidebar() {
  const sidebarRoutes = getSidebarRoutes();

  return (
    <aside className="sidebar" role="navigation" aria-label="Main navigation">
      <div className="sidebar__header">
        <h1 className="sidebar__title">Xenia Manager</h1>
      </div>

      <nav className="sidebar__nav">
        {sidebarRoutes.map((route) => (
          <NavLink
            key={route.path}
            to={route.path}
            end={route.path === "/"}
            className={({ isActive }) =>
              `sidebar__link ${isActive ? "sidebar__link--active" : ""}`
            }
          >
            <span className="sidebar__icon">{iconMap[route.icon] ?? ""}</span>
            <span className="sidebar__label">{route.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
