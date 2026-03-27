import { useEffect, useRef } from "react";
import { useSettings } from "../../features/settings/state/settingsStore";
import { useTasks, selectTaskSummary } from "../../features/tasks/state/tasksStore";
import type { ReleaseMetadata } from "../../features/settings/model/releaseTypes";
import { getReleaseMetadata } from "../../features/settings/api/releaseClient";
import { useXenia } from "../../features/xenia/state/xeniaStore";
import "./StatusBar.css";

export interface StatusItem {
  id: string;
  label: string;
  value: string;
  status: "idle" | "active" | "success" | "warning" | "error";
}

/**
 * Compact system status surface visible at the bottom of the sidebar.
 * Shows Xenia install state and packaged build information when available.
 */
export function StatusBar() {
  const { state, dispatch } = useSettings();
  const { state: tasksState } = useTasks();
  const { state: xeniaState } = useXenia();
  const metadata = state.releaseMetadata;
  const taskSummary = selectTaskSummary(tasksState);

  // Fetch release metadata once on mount if not already loaded
  // Use ref to track if we've attempted to load, avoiding setState in effect
  const loadAttemptedRef = useRef(false);
  useEffect(() => {
    if (!metadata && !loadAttemptedRef.current) {
      loadAttemptedRef.current = true;
      getReleaseMetadata()
        .then((m) => dispatch({ type: "SET_RELEASE_METADATA", metadata: m }))
        .catch(() => {
          // Not in Tauri runtime -- leave metadata null
        });
    }
  }, [metadata, dispatch]);

  const items = buildStatusItems(metadata, xeniaState.installState.status, taskSummary.running);

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
      {metadata && (
        <div className="status-bar__build-info">
          <span className="status-bar__build-label">
            {metadata.build_kind_label}
          </span>
          <span className="status-bar__build-version">v{metadata.version}</span>
        </div>
      )}
    </div>
  );
}

function buildStatusItems(
  metadata: ReleaseMetadata | null,
  xeniaStatus: "not_installed" | "installed" | "install_failed" | "update_failed",
  runningTasks: number,
): StatusItem[] {
  const xeniaItem: StatusItem = (() => {
    switch (xeniaStatus) {
      case "installed":
        return { id: "xenia", label: "Xenia", value: "Installed", status: "success" };
      case "install_failed":
      case "update_failed":
        return { id: "xenia", label: "Xenia", value: "Needs attention", status: "error" };
      default:
        return { id: "xenia", label: "Xenia", value: "Not installed", status: "idle" };
    }
  })();

  const tasksItem: StatusItem =
    runningTasks > 0
      ? {
          id: "tasks",
          label: "Tasks",
          value: `${runningTasks} active`,
          status: "active",
        }
      : {
          id: "tasks",
          label: "Tasks",
          value: "None active",
          status: "idle",
        };

  const items: StatusItem[] = [
    xeniaItem,
    tasksItem,
  ];

  if (metadata) {
    const buildStatus: StatusItem = {
      id: "build",
      label: "Build",
      value:
        metadata.build_kind === "packaged_appimage"
          ? "AppImage"
          : "Development",
      status:
        metadata.build_kind === "packaged_appimage" ? "success" : "warning",
    };
    items.push(buildStatus);

    if (metadata.updater.available) {
      items.push({
        id: "updater",
        label: "Updater",
        value: "Ready",
        status: "success",
      });
    }
  }

  return items;
}
