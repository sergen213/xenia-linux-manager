import { useCallback, useEffect, useRef, useState } from "react";
import { getGameXeniaPatches, toggleXeniaPatchEntry } from "../api/libraryClient";
import type { GameXeniaPatches, XeniaPatchFile } from "../api/libraryClient";
import { CustomSelect } from "./CustomSelect";
import type { SelectOption } from "./CustomSelect";
import { PatchImportDropzone } from "./PatchImportDropzone";

interface ManagePatchesPanelProps {
  titleId: string | null;
  appDataPath: string;
  onImport: (input: { file_name: string; contents: string }) => Promise<void>;
  importPending: boolean;
}

/** Strip the title_id prefix and .patch.toml suffix to get a human-friendly label. */
function patchFileLabel(file: XeniaPatchFile): string {
  let label = file.file_name;
  // Remove leading "XXXXXXXX - " prefix
  label = label.replace(/^[A-Fa-f0-9]{8}\s*-\s*/, "");
  // Remove trailing ".patch.toml"
  label = label.replace(/\.patch\.toml$/i, "");
  return label || file.file_name;
}

export function ManagePatchesPanel({ titleId, appDataPath, onImport, importPending }: ManagePatchesPanelProps) {
  const [patches, setPatches] = useState<GameXeniaPatches | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  const loadPatches = useCallback(async (showLoading: boolean) => {
    if (!titleId || !appDataPath) return;
    if (showLoading) setLoading(true);
    try {
      const result = await getGameXeniaPatches(appDataPath, titleId);
      setPatches(result);
      // On first load, auto-select the best file.
      if (!initialLoadDone.current && result.files.length > 0) {
        initialLoadDone.current = true;
        // Prefer a file with enabled entries, else the first file.
        const withEnabled = result.files.find((f) => f.entries.some((e) => e.is_enabled));
        setSelectedFilePath((withEnabled ?? result.files[0]).file_path);
      }
    } catch (err) {
      console.error("[patches] Load failed:", err);
      if (showLoading) setPatches(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [titleId, appDataPath]);

  // Reset on title change
  useEffect(() => {
    initialLoadDone.current = false;
    setSelectedFilePath(null);
    void loadPatches(true);
  }, [loadPatches]);

  const handleToggle = useCallback(async (filePath: string, entryName: string, enabled: boolean) => {
    console.log("[patches] handleToggle called:", { filePath, entryName, enabled, appDataPath });
    setToggling(entryName);
    setError(null);
    try {
      const result = await toggleXeniaPatchEntry(appDataPath, filePath, entryName, enabled);
      console.log("[patches] toggle result:", result);
      // Reload without loading spinner to keep scroll position
      await loadPatches(false);
      console.log("[patches] patches reloaded");
    } catch (err) {
      console.error("[patches] Toggle failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setToggling(null);
    }
  }, [appDataPath, loadPatches]);

  const handleImport = useCallback(async (input: { file_name: string; contents: string }) => {
    await onImport(input);
    await loadPatches(true);
  }, [onImport, loadPatches]);

  if (!titleId) {
    return (
      <div className="library-page__empty-state">
        No title ID available for this game. Patches cannot be matched.
      </div>
    );
  }

  const selectedFile = patches?.files.find((f) => f.file_path === selectedFilePath) ?? null;

  return (
    <section className="manage-patches">
      <header className="manage-patches__header">
        <div>
          <h3>Game Patches</h3>
          <p>
            {patches && patches.files.length > 0
              ? "Select your game version and toggle patches."
              : "Toggle patch entries for this game. Download patches from the Sources & Scan tab."}
          </p>
        </div>
      </header>

      {error && (
        <div className="manage-patches__error">
          {error}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <PatchImportDropzone pending={importPending} onImport={handleImport} />

      {loading ? (
        <div className="library-page__empty-state">Loading patches…</div>
      ) : !patches || patches.files.length === 0 ? (
        <div className="library-page__empty-state">
          No patch files found for title ID {titleId}. Download patches from the Sources &amp; Scan tab or import a file above.
        </div>
      ) : (
        <>
          {/* Version selector — only shown when multiple patch files exist */}
          {patches.files.length > 1 && (
            <PatchVersionPicker
              files={patches.files}
              selectedFilePath={selectedFilePath}
              onSelect={setSelectedFilePath}
            />
          )}

          {/* Patch entries for the selected file */}
          {selectedFile && selectedFile.entries.length > 0 && (
            <ul className="patch-checklist__list">
              {selectedFile.entries.map((entry) => (
                <li key={entry.name} className="patch-checklist__item">
                  <label className="patch-checklist__toggle" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={entry.is_enabled}
                      disabled={toggling !== null}
                      onChange={(e) => {
                        e.stopPropagation();
                        console.log("[patches] Toggle:", entry.name, "->", e.target.checked);
                        void handleToggle(selectedFile.file_path, entry.name, e.target.checked);
                      }}
                    />
                    <span>
                      <strong>{entry.name}</strong>
                      {entry.description && <small>{entry.description}</small>}
                      {entry.author && <small style={{ opacity: 0.6 }}>by {entry.author}</small>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {selectedFile && selectedFile.entries.length === 0 && (
            <div className="library-page__empty-state">
              This patch file has no entries.
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PatchVersionPicker({ files, selectedFilePath, onSelect }: {
  files: XeniaPatchFile[];
  selectedFilePath: string | null;
  onSelect: (filePath: string) => void;
}) {
  const options: SelectOption[] = files.map((file) => {
    const enabled = file.entries.filter((e) => e.is_enabled).length;
    const suffix = enabled > 0 ? ` (${enabled} enabled)` : "";
    return { value: file.file_path, label: `${patchFileLabel(file)}${suffix}` };
  });

  return (
    <div className="patch-version-picker">
      <label className="patch-version-picker__label">
        Game version ({files.length} available)
      </label>
      <CustomSelect
        value={selectedFilePath ?? files[0]?.file_path ?? ""}
        options={options}
        onChange={onSelect}
      />
    </div>
  );
}
