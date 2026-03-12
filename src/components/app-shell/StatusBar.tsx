import "./StatusBar.css";

export interface StatusItem {
  id: string;
  label: string;
  value: string;
  status: "idle" | "active" | "success" | "warning" | "error";
}

/**
 * Compact system status surface visible at the bottom of the sidebar.
 * Future plans will hydrate this with real task and system data.
 */
export function StatusBar() {
  // Placeholder items -- later phases replace these with live data
  const items: StatusItem[] = [
    {
      id: "xenia",
      label: "Xenia",
      value: "Not installed",
      status: "idle",
    },
    {
      id: "tasks",
      label: "Tasks",
      value: "None active",
      status: "idle",
    },
  ];

  return (
    <div className="status-bar" role="status" aria-label="System status">
      <div className="status-bar__header">Status</div>
      <div className="status-bar__items">
        {items.map((item) => (
          <div key={item.id} className="status-bar__item">
            <span
              className={`status-bar__indicator status-bar__indicator--${item.status}`}
            />
            <span className="status-bar__label">{item.label}</span>
            <span className="status-bar__value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
