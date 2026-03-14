import type { EffectiveConfig, ProfileInventory } from "../model/profileTypes";

interface ProfileSummaryCardProps {
  inventory: ProfileInventory | null;
  effectiveConfig: EffectiveConfig | null;
  loading: boolean;
}

/**
 * Compact profile summary shown inside game detail and launch preflight.
 * Displays the active profile name, changed setting count, and key overrides.
 */
export function ProfileSummaryCard({
  inventory,
  effectiveConfig,
  loading,
}: ProfileSummaryCardProps) {
  if (loading) {
    return (
      <div className="profile-summary profile-summary--loading">
        Loading profile...
      </div>
    );
  }

  const activeProfile = inventory?.profiles.find((p) => p.active);

  if (!activeProfile) {
    return (
      <div className="profile-summary profile-summary--empty">
        <span className="profile-summary__label">Profile</span>
        <span className="profile-summary__value">None selected</span>
      </div>
    );
  }

  const changedCount = effectiveConfig?.changed_count ?? activeProfile.override_count;
  const changedFields =
    effectiveConfig?.fields.filter((f) => f.changed) ?? [];

  return (
    <div className="profile-summary">
      <div className="profile-summary__header">
        <span className="profile-summary__label">Active profile</span>
        <strong className="profile-summary__name">{activeProfile.name}</strong>
        {activeProfile.source === "recommended" && (
          <span className="profile-summary__badge">Recommended</span>
        )}
      </div>
      <div className="profile-summary__stats">
        <span>
          {changedCount} {changedCount === 1 ? "setting" : "settings"} changed
        </span>
      </div>
      {changedFields.length > 0 && (
        <ul className="profile-summary__changes">
          {changedFields.slice(0, 5).map((field) => (
            <li key={field.key} className="profile-summary__change">
              <span className="profile-summary__key">{field.key}</span>
              <span className="profile-summary__val">{String(field.value)}</span>
            </li>
          ))}
          {changedFields.length > 5 && (
            <li className="profile-summary__change profile-summary__more">
              +{changedFields.length - 5} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
