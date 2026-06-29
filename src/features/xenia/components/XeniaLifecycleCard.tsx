import { useEffect, useMemo, useState } from "react";
import { useXenia } from "../state/xeniaStore";
import { useSettings } from "../../settings/state/settingsStore";
import {
  fetchRecentReleases,
  removeXeniaInstall,
  switchActiveXeniaBuild,
} from "../api/xeniaClient";
import {
  buildLabel,
  channelLabel,
  lifecycleStatusLabel,
  type LinuxRelease,
  type ReleaseChannel,
} from "../model/xeniaTypes";
import { XeniaLifecycleDialog } from "./XeniaLifecycleDialog";
import { CustomSelect } from "../../library/components/CustomSelect";
import "./XeniaLifecycleCard.css";

interface XeniaLifecycleCardProps {
  channel: ReleaseChannel;
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export function XeniaLifecycleCard({ channel }: XeniaLifecycleCardProps) {
  const { state, dispatch } = useXenia();
  const { state: settingsState } = useSettings();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"install" | "update" | "retry">("install");
  const [releases, setReleases] = useState<LinuxRelease[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState("");
  const [selectedInstalledId, setSelectedInstalledId] = useState("");
  const [busyBuildId, setBusyBuildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const appDataPath = settingsState.settings?.app_data_path;
  const xeniaPath = settingsState.settings?.xenia_path;

  const installedBuilds = useMemo(
    () => state.installState.installed_builds.filter((build) => build.channel === channel),
    [state.installState.installed_builds, channel],
  );
  const activeBuild = state.installState.manifest?.channel === channel
    ? state.installState.manifest
    : null;
  const failure = state.installState.failure?.channel === channel
    ? state.installState.failure
    : null;

  useEffect(() => {
    let cancelled = false;
    setLoadingReleases(true);
    fetchRecentReleases(channel)
      .then((items) => {
        if (cancelled) return;
        setReleases(items);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingReleases(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [channel]);

  const recentReleases = useMemo(() => {
    const cutoff = Date.now() - TWO_WEEKS_MS;
    const filtered = releases.filter((release) => {
      const publishedAt = Date.parse(release.published_at);
      return Number.isFinite(publishedAt) && publishedAt >= cutoff;
    });
    return filtered.length > 0 ? filtered : releases.slice(0, 10);
  }, [releases]);

  useEffect(() => {
    if (!selectedReleaseId) {
      const defaultRelease =
        recentReleases.find((release) => release.build_id === activeBuild?.build_id)
        ?? recentReleases[0];
      if (defaultRelease) {
        setSelectedReleaseId(defaultRelease.build_id);
      }
    }
  }, [recentReleases, selectedReleaseId, activeBuild?.build_id]);

  useEffect(() => {
    if (!selectedInstalledId) {
      const defaultBuild = activeBuild ?? installedBuilds[0];
      if (defaultBuild) {
        setSelectedInstalledId(defaultBuild.build_id);
      }
    } else if (!installedBuilds.some((build) => build.build_id === selectedInstalledId)) {
      setSelectedInstalledId(activeBuild?.build_id ?? installedBuilds[0]?.build_id ?? "");
    }
  }, [installedBuilds, selectedInstalledId, activeBuild]);

  const selectedRelease = recentReleases.find((release) => release.build_id === selectedReleaseId) ?? null;
  const selectedInstalledBuild =
    installedBuilds.find((build) => build.build_id === selectedInstalledId) ?? null;
  const releaseOptions = useMemo(
    () => (
      recentReleases.length === 0
        ? [{ value: "", label: "No releases found" }]
        : recentReleases.map((release) => ({
            value: release.build_id,
            label: `${release.tag} (${new Date(release.published_at).toLocaleDateString()})`,
          }))
    ),
    [recentReleases],
  );
  const installedBuildOptions = useMemo(
    () => (
      installedBuilds.length === 0
        ? [{ value: "", label: "No installed builds" }]
        : installedBuilds.map((build) => ({
            value: build.build_id,
            label: buildLabel(build),
          }))
    ),
    [installedBuilds],
  );
  const latestRelease = recentReleases[0] ?? null;
  const selectedReleaseInstalled = selectedRelease
    ? installedBuilds.some((build) => build.build_id === selectedRelease.build_id)
    : false;
  const updateAvailable = latestRelease
    ? !installedBuilds.some((build) => build.build_id === latestRelease.build_id)
    : false;
  const status = failure
    ? failure.retry_mode === "install" ? "install_failed" : "update_failed"
    : installedBuilds.length > 0
      ? "installed"
      : "not_installed";

  const openDialog = (action: "install" | "update" | "retry") => {
    setDialogAction(action);
    setDialogOpen(true);
  };

  const handleInstallSelected = () => {
    if (!selectedRelease) return;
    if (selectedReleaseInstalled) {
      void handleUseBuild(selectedRelease.build_id);
      return;
    }
    const action =
      installedBuilds.length > 0 && latestRelease?.build_id === selectedRelease.build_id
        ? "update"
        : "install";
    openDialog(action);
  };

  const handleUseBuild = async (buildId: string) => {
    if (!appDataPath) return;
    setBusyBuildId(buildId);
    try {
      const installState = await switchActiveXeniaBuild(appDataPath, buildId);
      dispatch({ type: "SET_INSTALL_STATE", installState });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyBuildId(null);
    }
  };

  const handleUninstallBuild = async () => {
    if (!appDataPath || !xeniaPath || !selectedInstalledBuild) return;
    const confirmed = window.confirm(
      `Uninstall ${buildLabel(selectedInstalledBuild)}?`,
    );
    if (!confirmed) return;

    setBusyBuildId(selectedInstalledBuild.build_id);
    try {
      const installState = await removeXeniaInstall(
        appDataPath,
        xeniaPath,
        selectedInstalledBuild.build_id,
      );
      dispatch({ type: "SET_INSTALL_STATE", installState });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyBuildId(null);
    }
  };

  const primaryLabel = failure
    ? "Retry"
    : selectedReleaseInstalled
      ? activeBuild?.build_id === selectedRelease?.build_id
        ? "Installed"
        : "Use"
      : installedBuilds.length > 0
        ? latestRelease?.build_id === selectedRelease?.build_id
          ? "Update"
          : "Install Selected"
        : "Install";

  const primaryDisabled =
    loadingReleases
    || (!failure && !selectedRelease)
    || (selectedReleaseInstalled && activeBuild?.build_id === selectedRelease?.build_id);

  return (
    <>
      <div
        className={`xenia-card ${failure ? "xenia-card--failed" : ""}`}
        data-testid={`xenia-lifecycle-card-${channel}`}
      >
        <h3 className="xenia-card__title">{channelLabel(channel)}</h3>

        <p className="xenia-card__value" data-testid={`xenia-card-version-${channel}`}>
          {activeBuild?.tag ?? selectedInstalledBuild?.tag ?? "--"}
        </p>

        <p className="xenia-card__status" data-testid={`xenia-card-status-${channel}`}>
          {lifecycleStatusLabel(status)}
        </p>

        {activeBuild && (
          <div className="xenia-card__details">
            <span className="xenia-card__detail">Active: {buildLabel(activeBuild)}</span>
            <span className="xenia-card__detail">
              Released: {new Date(activeBuild.published_at).toLocaleDateString()}
            </span>
          </div>
        )}

        {updateAvailable && latestRelease && (
          <p className="xenia-card__update-notice">
            Latest available: {latestRelease.tag}
          </p>
        )}

        {failure && (
          <p className="xenia-card__failure-summary">
            {failure.error}
          </p>
        )}

        {error && (
          <p className="xenia-card__failure-summary">
            {error}
          </p>
        )}

        <div className="xenia-card__control-group">
          <label className="xenia-card__label" htmlFor={`xenia-release-select-${channel}`}>
            Available builds
          </label>
          <CustomSelect
            id={`xenia-release-select-${channel}`}
            className="xenia-card__select custom-select--xenia"
            menuClassName="custom-select__menu--xenia"
            value={selectedReleaseId}
            options={releaseOptions}
            onChange={setSelectedReleaseId}
            disabled={loadingReleases || recentReleases.length === 0}
          />
          <p className="xenia-card__detail">
            Showing builds published since {new Date(Date.now() - TWO_WEEKS_MS).toLocaleDateString()}
            {recentReleases.length !== releases.length ? " (fallback to recent history when needed)." : "."}
          </p>
        </div>

        <div className="xenia-card__actions">
          <button
            className="ui-button ui-button--primary"
            onClick={() => {
              if (failure) {
                openDialog("retry");
              } else {
                handleInstallSelected();
              }
            }}
            disabled={primaryDisabled || busyBuildId !== null}
            data-testid={`xenia-primary-action-${channel}`}
          >
            {loadingReleases ? "Loading..." : primaryLabel}
          </button>
        </div>

        <div className="xenia-card__control-group">
          <label className="xenia-card__label" htmlFor={`xenia-installed-select-${channel}`}>
            Installed builds
          </label>
          <CustomSelect
            id={`xenia-installed-select-${channel}`}
            className="xenia-card__select custom-select--xenia"
            menuClassName="custom-select__menu--xenia"
            value={selectedInstalledId}
            options={installedBuildOptions}
            onChange={setSelectedInstalledId}
            disabled={installedBuilds.length === 0}
          />
        </div>

        <div className="xenia-card__actions">
          <button
            className="ui-button ui-button--small"
            onClick={() => selectedInstalledBuild && void handleUseBuild(selectedInstalledBuild.build_id)}
            disabled={
              !selectedInstalledBuild
              || busyBuildId !== null
              || activeBuild?.build_id === selectedInstalledBuild.build_id
            }
          >
            {busyBuildId === selectedInstalledBuild?.build_id ? "Working..." : "Use selected"}
          </button>
          <button
            className="ui-button ui-button--small ui-button--danger"
            onClick={() => void handleUninstallBuild()}
            disabled={!selectedInstalledBuild || busyBuildId !== null}
            data-testid={`xenia-uninstall-${channel}`}
          >
            {busyBuildId === selectedInstalledBuild?.build_id ? "Removing..." : "Uninstall selected"}
          </button>
        </div>
      </div>

      {dialogOpen && (
        <XeniaLifecycleDialog
          action={dialogAction}
          channel={channel}
          release={failure ? null : selectedRelease}
          failure={failure}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
