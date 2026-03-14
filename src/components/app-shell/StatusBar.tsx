import { useEffect, useState } from "react";
import { useSettings } from "../../features/settings/state/settingsStore";
import type { ReleaseMetadata } from "../../features/settings/model/releaseTypes";
import { getReleaseMetadata } from "../../features/settings/api/releaseClient";
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
  const [loadAttempted, setLoadAttempted] = useState(false);
  const metadata = state.releaseMetadata;

  // Fetch release metadata once on mount if not already loaded
  useEffect(() => {
    if (!metadata && !loadAttempted) {
      setLoadAttempted(true);
      getReleaseMetadata()
        .then((m) => dispatch({ type: "SET_RELEASE_METADATA", metadata: m }))
        .catch(() => {
          // Not in Tauri runtime -- leave metadata null
        });
    }
  }, [metadata, loadAttempted, dispatch]);

  const items = buildStatusItems(metadata);

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

function buildStatusItems(metadata: ReleaseMetadata | null): StatusItem[] {
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
