import { useEffect, useState } from "react";
import {
  checkForUpdates,
  getUpdateStatus,
  installUpdate,
  onUpdateStatus,
  type UpdateStatus,
} from "./bridge";

/**
 * Subscribe to the Electron host's auto-update status and expose the manual
 * check / install actions. Shared by the app-shell "Restart & update" banner
 * and the Settings release card, so both reflect the same live state.
 */
export function useAppUpdates() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });

  useEffect(() => {
    // Sync current state on mount (the deferred auto-check may have already run
    // before this component mounted), then follow live events.
    getUpdateStatus().then(setStatus).catch(() => {});
    return onUpdateStatus(setStatus);
  }, []);

  return { status, check: checkForUpdates, install: installUpdate };
}
