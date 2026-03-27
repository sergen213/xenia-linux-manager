import type { LaunchPreflight } from "../model/libraryTypes";
import type { EffectiveConfig, ProfileInventory } from "../model/profileTypes";
import { ProfileSummaryCard } from "./ProfileSummaryCard";

interface LaunchPreflightPanelProps {
  preflight: LaunchPreflight | null;
  launchPending: boolean;
  onLaunch: () => Promise<void>;
  onConfirmWarningLaunch: () => Promise<void>;
  profileInventory: ProfileInventory | null;
  profileEffectiveConfig: EffectiveConfig | null;
  profileEffectiveLoading: boolean;
}

export function LaunchPreflightPanel({
  preflight,
  launchPending,
  onLaunch,
  onConfirmWarningLaunch,
  profileInventory,
  profileEffectiveConfig,
  profileEffectiveLoading,
}: LaunchPreflightPanelProps) {
  if (!preflight) {
    return <div className="library-page__empty-state">Loading launch readiness...</div>;
  }

  return (
    <section className="launch-preflight">
      <div className="launch-preflight__header">
        <h3>Launch readiness</h3>
        <button
          type="button"
          disabled={!preflight.can_launch || launchPending}
          onClick={() =>
            void (preflight.requires_confirmation
              ? onConfirmWarningLaunch()
              : onLaunch())
          }
        >
          {launchPending
            ? "Launching..."
            : preflight.requires_confirmation
              ? "Launch anyway"
              : "Launch in Xenia"}
        </button>
      </div>

      {preflight.blockers.length > 0 ? (
        <ul className="launch-preflight__blockers">
          {preflight.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : (
        <p className="launch-preflight__ready">Ready to launch.</p>
      )}

      {preflight.warnings.length > 0 && (
        <ul className="launch-preflight__warnings">
          {preflight.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {preflight.can_launch && (
        <div className="launch-preflight__profile">
          <ProfileSummaryCard
            inventory={profileInventory}
            effectiveConfig={profileEffectiveConfig}
            loading={profileEffectiveLoading}
          />
        </div>
      )}
    </section>
  );
}
