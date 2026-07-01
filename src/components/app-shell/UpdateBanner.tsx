import { useAppUpdates } from "../../platform/useAppUpdates";
import "./UpdateBanner.css";

/**
 * Slim banner that appears once an update has finished downloading in the
 * background. "Restart & update" quits and relaunches into the new version;
 * ignoring it still installs on the next quit (autoInstallOnAppQuit).
 */
export function UpdateBanner() {
  const { status, install } = useAppUpdates();
  if (status.state !== "downloaded") return null;
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      <span className="update-banner__label">
        Update ready — v{status.version}
      </span>
      <button
        type="button"
        className="update-banner__btn"
        onClick={() => void install()}
      >
        Restart &amp; update
      </button>
    </div>
  );
}
