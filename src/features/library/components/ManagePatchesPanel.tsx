import { useCallback, useEffect, useRef, useState } from "react";
import { getGameXeniaPatches, toggleXeniaPatchEntry } from "../api/libraryClient";
import type { GameXeniaPatches, XeniaPatchFile } from "../api/libraryClient";
import { CustomSelect } from "./CustomSelect";
import type { SelectOption } from "./CustomSelect";
import { PatchImportDropzone } from "./PatchImportDropzone";

interface ManagePatchesPanelProps {
  titleId: string | null;
  appDataPath: string;
  hasTitleUpdate: boolean;
  onImport: (input: { file_name: string; contents: string }) => Promise<void>;
  importPending: boolean;
}

function hasVersionSpecificMetadata(file: XeniaPatchFile): boolean {
  return Boolean(file.version) || file.hashes.length > 0;
}

function pickInitialPatchFile(files: XeniaPatchFile[], hasTitleUpdate: boolean): XeniaPatchFile {
  const withEnabled = files.filter((file) => file.entries.some((entry) => entry.is_enabled));

  if (hasTitleUpdate) {
    const enabledWithVersionMetadata = withEnabled.find(hasVersionSpecificMetadata);
    if (enabledWithVersionMetadata) return enabledWithVersionMetadata;

    const anyWithVersionMetadata = files.find(hasVersionSpecificMetadata);
    if (anyWithVersionMetadata) return anyWithVersionMetadata;
  }

  return withEnabled[0] ?? files[0];
}

function buildPatchCompatibilityMessage(file: XeniaPatchFile, hasTitleUpdate: boolean): string | null {
  if (!hasTitleUpdate) {
    return null;
  }

  if (hasVersionSpecificMetadata(file)) {
    const parts: string[] = [];
    if (file.version) {
      parts.push(`patch version ${file.version}`);
    }
    if (file.hashes.length > 0) {
      parts.push(`${file.hashes.length} executable hash${file.hashes.length === 1 ? "" : "es"}`);
    }
    return `Title update detected. This patch file includes ${parts.join(" and ")}, so prefer it only when it matches your installed update.`;
  }

  return "Title update detected. This patch file has no version or executable hash metadata, so base-game patches may appear enabled but not apply to the updated title.";
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

export function ManagePatchesPanel({ titleId, appDataPath, hasTitleUpdate, onImport, importPending }: ManagePatchesPanelProps) {
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
        setSelectedFilePath(pickInitialPatchFile(result.files, hasTitleUpdate).file_path);
      }
    } catch (err) {
      console.error("[patches] Load failed:", err);
      if (showLoading) setPatches(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [titleId, appDataPath, hasTitleUpdate]);

  // Reset on title change
  useEffect(() => {
    initialLoadDone.current = false;
    setSelectedFilePath(null);
    void loadPatches(true);
  }, [loadPatches]);

  const handleToggle = useCallback(async (filePath: string, entryName: string, enabled: boolean) => {
    setToggling(entryName);
    setError(null);
    try {
      await toggleXeniaPatchEntry(filePath, entryName, enabled);
      // Reload without loading spinner to keep scroll position
      await loadPatches(false);
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
  const selectedFileCompatibilityMessage = selectedFile
    ? buildPatchCompatibilityMessage(selectedFile, hasTitleUpdate)
    : null;

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

      {hasTitleUpdate && (
        <div className="manage-patches__error" role="note">
          Title update detected for this game. Patches often need a matching update version or executable hash to apply.
        </div>
      )}

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
              hasTitleUpdate={hasTitleUpdate}
            />
          )}

          {selectedFileCompatibilityMessage && (
            <div className="manage-patches__error" role="note">
              {selectedFileCompatibilityMessage}
            </div>
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
                        void handleToggle(selectedFile.file_path, entry.name, e.target.checked);
                      }}
                    />
                    <span>
                      <strong>{entry.name}</strong>
                      {entry.description && <small>{entry.description}</small>}
                      {entry.author && <small className="patch-checklist__author">by {entry.author}</small>}
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

function PatchVersionPicker({ files, selectedFilePath, onSelect, hasTitleUpdate }: {
  files: XeniaPatchFile[];
  selectedFilePath: string | null;
  onSelect: (filePath: string) => void;
  hasTitleUpdate: boolean;
}) {
  const options: SelectOption[] = files.map((file) => {
    const enabled = file.entries.filter((e) => e.is_enabled).length;
    const suffix = enabled > 0 ? ` (${enabled} enabled)` : "";
    const metadataSuffix = hasTitleUpdate
      ? file.version
        ? ` • v${file.version}`
        : file.hashes.length > 0
          ? ` • ${file.hashes.length} hash${file.hashes.length === 1 ? "" : "es"}`
          : " • no TU metadata"
      : "";
    return { value: file.file_path, label: `${patchFileLabel(file)}${metadataSuffix}${suffix}` };
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
