import type { LaunchPreflight, LibraryGameDetails } from "../model/libraryTypes";
import type {
  ProfileInventory,
  RecommendationAvailability,
} from "../model/profileTypes";
import { GameIdentityEditor } from "./GameIdentityEditor";
import { LaunchPreflightPanel } from "./LaunchPreflightPanel";
import { LaunchWarningDialog } from "./LaunchWarningDialog";
import { ManagePatchesPanel } from "./ManagePatchesPanel";

interface GameDetailsPanelProps {
  details: LibraryGameDetails | null;
  preflight: LaunchPreflight | null;
  launchPending: boolean;
  onSaveIdentity: (payload: {
    game_id: string;
    title: string;
    executable_path: string;
    issue_notes: string[];
  }) => Promise<void>;
  onLaunch: () => Promise<void>;
  onConfirmWarningLaunch: () => Promise<void>;
  managePatchesOpen: boolean;
  patchInventoryLoading: boolean;
  patchOperationPending: boolean;
  chooserOpen: boolean;
  chooserReason: string | null;
  patchUnsupportedMessage: string | null;
  onManagePatchesToggle: () => void;
  onImportPatch: (input: { file_name: string; contents: string }) => Promise<void>;
  onFetchPatch: (confirmReplace?: boolean) => Promise<void>;
  onSelectActivePatch: (patchFileId: string | null) => Promise<void>;
  onTogglePatchEntry: (patchFileId: string, entryId: string, enabled: boolean) => Promise<void>;
  onOpenPatchChooser: () => void;
  onClosePatchChooser: () => void;
  profileInventory: ProfileInventory | null;
  recommendationAvailability: RecommendationAvailability | null;
  applyRecommendationPending: boolean;
  onApplyRecommendation: () => Promise<void>;
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) {
    return "Never";
  }
  return new Date(timestamp).toLocaleString();
}

export function GameDetailsPanel({
  details,
  preflight,
  launchPending,
  onSaveIdentity,
  onLaunch,
  onConfirmWarningLaunch,
  managePatchesOpen,
  patchInventoryLoading,
  patchOperationPending,
  chooserOpen,
  chooserReason,
  patchUnsupportedMessage,
  onManagePatchesToggle,
  onImportPatch,
  onFetchPatch,
  onSelectActivePatch,
  onTogglePatchEntry,
  onOpenPatchChooser,
  onClosePatchChooser,
  profileInventory,
  recommendationAvailability,
  applyRecommendationPending,
  onApplyRecommendation,
}: GameDetailsPanelProps) {
  if (!details) {
    return (
      <aside className="game-details">
        <div className="library-page__empty-state">
          Select a title to inspect identity, source evidence, and launch
          readiness.
        </div>
      </aside>
    );
  }

  return (
    <aside className="game-details">
      <header className="game-details__header">
        <div>
          <h2>{details.title}</h2>
          <p>{details.source_label}</p>
        </div>
        {details.manual && <span className="library-grid__badge">Manual</span>}
      </header>

      <section className="game-details__facts">
        <div>
          <span>Executable</span>
          <strong>{details.executable_path}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{details.confidence}</strong>
        </div>
        <div>
          <span>Last played</span>
          <strong>{formatTimestamp(details.last_played_at)}</strong>
        </div>
        <div>
          <span>Review state</span>
          <strong>{details.review_flag ? "Needs review" : "Ready"}</strong>
        </div>
      </section>

      <LaunchPreflightPanel
        preflight={preflight}
        launchPending={launchPending}
        onLaunch={onLaunch}
      />
      <LaunchWarningDialog preflight={preflight} onConfirm={onConfirmWarningLaunch} />

      <section className="game-details__section">
        <div className="game-details__section-header">
          <h3>Patches</h3>
          <button type="button" onClick={onManagePatchesToggle}>
            {managePatchesOpen ? "Hide patch manager" : "Manage patches"}
          </button>
        </div>
        {managePatchesOpen ? (
          <ManagePatchesPanel
            inventory={details.patches ?? null}
            loading={patchInventoryLoading}
            pending={patchOperationPending}
            chooserOpen={chooserOpen}
            chooserReason={chooserReason}
            unsupportedMessage={patchUnsupportedMessage}
            onImport={onImportPatch}
            onFetchRemote={onFetchPatch}
            onSelectActive={onSelectActivePatch}
            onToggleEntry={onTogglePatchEntry}
            onOpenChooser={onOpenPatchChooser}
            onCloseChooser={onClosePatchChooser}
          />
        ) : (
          <p className="game-details__muted">
            Keep patch controls on demand until you need to import, fetch, or edit them.
          </p>
        )}
      </section>

      <section className="game-details__section">
        <h3>Profiles</h3>
        {profileInventory && profileInventory.profiles.length > 0 ? (
          <ul className="game-details__list">
            {profileInventory.profiles.map((profile) => (
              <li key={profile.id}>
                <strong>{profile.name}</strong>
                <span>
                  {profile.source === "recommended" ? "Recommended" : "Local"}
                  {profile.active ? " (active)" : ""}
                </span>
                {profile.recommendation_linkage && (
                  <span className="game-details__muted">
                    via {profile.recommendation_linkage.source_label}
                  </span>
                )}
                <span>{profile.override_count} overrides</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="game-details__muted">No profiles configured.</p>
        )}
        {recommendationAvailability?.status === "available" && (
          <button
            type="button"
            disabled={applyRecommendationPending}
            onClick={onApplyRecommendation}
          >
            {applyRecommendationPending
              ? "Applying..."
              : `Apply recommended settings from ${recommendationAvailability.source_label}`}
          </button>
        )}
      </section>

      <section className="game-details__section">
        <h3>Evidence</h3>
        <ul className="game-details__list">
          {details.evidence.map((evidence) => (
            <li key={`${evidence.source_id}:${evidence.path}`}>
              <strong>{evidence.source_label}</strong>
              <span>{evidence.path}</span>
              <span>
                {evidence.kind} / {evidence.confidence} / {evidence.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="game-details__section">
        <h3>Scan history</h3>
        <ul className="game-details__list">
          {details.scan_history.map((entry) => (
            <li key={`${entry.source_id}:${entry.completed_at}`}>
              <strong>{entry.source_label}</strong>
              <span>
                {entry.status}: {entry.found} found, {entry.duplicates} duplicates,{" "}
                {entry.warnings} warnings
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="game-details__section">
        <h3>Identity corrections</h3>
        <GameIdentityEditor details={details} onSave={onSaveIdentity} />
      </section>
    </aside>
  );
}
