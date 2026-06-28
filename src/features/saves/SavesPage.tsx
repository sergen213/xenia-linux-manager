import { useCallback, useEffect, useMemo, useState } from "react";
import { useSaves } from "./state/savesStore";
import { useSaveImportActions } from "./state/useSaveImportActions";
import { useSettings } from "../settings/state/settingsStore";
import { useLibrary } from "../library/state/libraryStore";
import {
  browseLibrary,
  getExportPreflight,
  exportSaveArchive,
} from "../library/api/libraryClient";
import { open } from "../../platform/bridge";
import type { ExportPreflight, ExportResult } from "./model/saveTypes";
import type { LibraryBrowseCard } from "../library/model/libraryTypes";
import { SaveImportWizard } from "./components/SaveImportWizard";
import { CoverArt } from "../../components/aurora/GameCase";
import "./SavesPage.css";
import "./AuroraSaves.css";

const CATEGORY_LABELS: Record<string, string> = {
  save: "Save",
  settings: "Settings",
  patches: "Patches",
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Aurora Saves screen: a per-game list (cover · title · contents · size) with
 * Export and Import per row. Export runs the real archive export; Import opens
 * the archive-first import wizard (the archive determines the target game).
 */
export function SavesPage() {
  const { state, dispatch } = useSaves();
  const { state: settingsState } = useSettings();
  const { state: libState } = useLibrary();

  const libPath = settingsState.settings?.library_metadata_path ?? "";
  const xeniaPath = settingsState.settings?.xenia_path ?? "";
  const appDataPath = settingsState.settings?.app_data_path ?? "";

  const importActions = useSaveImportActions({ libPath, xeniaPath, appDataPath });

  const [scanning, setScanning] = useState(false);
  const [detected, setDetected] = useState<ExportPreflight[]>([]);
  const [cards, setCards] = useState<LibraryBrowseCard[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Detect games with exportable save data (one preflight per game).
  useEffect(() => {
    if (!libPath || !xeniaPath) return;
    let cancelled = false;
    setScanning(true);
    setScanError(null);
    void (async () => {
      try {
        const browse = await browseLibrary(libPath);
        if (!cancelled) setCards(browse.cards);
        const preflights = await Promise.all(
          browse.cards.map((c) =>
            getExportPreflight(libPath, xeniaPath, c.game_id).catch(() => null),
          ),
        );
        if (cancelled) return;
        setDetected(preflights.filter((p): p is ExportPreflight => !!p && p.can_export));
      } catch (e) {
        if (!cancelled) setScanError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setScanning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [libPath, xeniaPath]);

  // Prefer this page's own browse fetch (always run on mount) so covers show
  // even when the Library tab was never opened; fall back to the shared store.
  const cardMap = useMemo(() => {
    const m = new Map<string, LibraryBrowseCard>();
    for (const c of libState.browse?.cards ?? []) m.set(c.game_id, c);
    for (const c of cards) m.set(c.game_id, c);
    return m;
  }, [libState.browse, cards]);

  const exportGame = useCallback(
    async (preflight: ExportPreflight) => {
      const dest = await open({
        directory: true,
        title: `Choose export folder for ${preflight.game_title}`,
      });
      if (typeof dest !== "string") return;
      setExportingId(preflight.game_id);
      setScanError(null);
      try {
        const res = await exportSaveArchive(
          appDataPath,
          libPath,
          xeniaPath,
          preflight.game_id,
          dest,
        );
        setExportResult(res);
      } catch (e) {
        setScanError(e instanceof Error ? e.message : String(e));
      } finally {
        setExportingId(null);
      }
    },
    [appDataPath, libPath, xeniaPath],
  );

  const wizardActive = state.importWizardStep !== "idle";

  return (
    <div className="aurora-saves">
      <div className="aurora-saves__header">
        <h1 className="aurora-saves__title">Game Saves</h1>
        {/* Archive-first import: the chosen .zip's manifest picks the target
            game by ID, so this works for any library game — even ones never
            played (no existing save row below). */}
        <button
          className="aurora-saves__btn aurora-saves__btn--ghost"
          onClick={() => void importActions.chooseAndInspect()}
        >
          Import save archive
        </button>
      </div>

      {exportResult && (
        <div className="aurora-saves__toast">
          <strong>Export complete: {exportResult.archive_filename}</strong>
          <span>{exportResult.archive_path}</span>
          <button
            className="aurora-saves__btn aurora-saves__btn--ghost"
            style={{ alignSelf: "flex-start", marginTop: 6 }}
            onClick={() => setExportResult(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="aurora-saves__card">
        {scanning && <p className="aurora-saves__hint">Detecting games with save data…</p>}
        {scanError && <p className="aurora-saves__error">{scanError}</p>}
        {!scanning && !scanError && detected.length === 0 && (
          <p className="aurora-saves__empty">
            No games with exportable save data found. Use “Import save archive”
            above to restore saves into any library game.
          </p>
        )}
        {detected.map((p) => {
          const card = cardMap.get(p.game_id);
          const cover = card ?? { title: p.game_title, artwork_path: null };
          const size = p.items.reduce((sum, i) => sum + (i.exists ? i.size_bytes : 0), 0);
          const cats = [...new Set(p.items.filter((i) => i.exists).map((i) => i.category))];
          return (
            <div key={p.game_id} className="aurora-saves__row">
              <CoverArt card={cover} w={38} />
              <div className="aurora-saves__main">
                <div className="aurora-saves__game" title={p.game_title}>{p.game_title}</div>
                <div className="aurora-saves__sub">
                  {cats.length ? cats.map((c) => CATEGORY_LABELS[c] ?? c).join(" · ") : "Save data"}
                </div>
              </div>
              <div className="aurora-saves__size">{formatSize(size)}</div>
              <button
                className="aurora-saves__btn aurora-saves__btn--jade"
                disabled={exportingId === p.game_id}
                onClick={() => void exportGame(p)}
              >
                {exportingId === p.game_id ? "Exporting…" : "Export"}
              </button>
            </div>
          );
        })}
      </div>

      {wizardActive && (
        <div className="aurora-saves__overlay" onClick={() => importActions.cancelImport()}>
          <div className="aurora-saves__overlay-panel" onClick={(e) => e.stopPropagation()}>
            <SaveImportWizard
              inspection={state.importInspection}
              inspectionLoading={state.importInspectionLoading}
              conflictPlan={state.importConflictPlan}
              applyPending={state.importApplyPending}
              wizardStep={state.importWizardStep}
              archivePath={state.importArchivePath}
              backupFailureError={state.backupFailureError}
              lastImportResult={state.lastImportResult}
              dispatch={dispatch}
              onChooseArchive={importActions.chooseAndInspect}
              onReviewConflicts={importActions.reviewConflicts}
              onApply={importActions.applyPlan}
              onCancel={importActions.cancelImport}
            />
          </div>
        </div>
      )}
    </div>
  );
}
