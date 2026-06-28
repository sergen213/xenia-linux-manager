import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { focusFirst } from "../../../components/app-shell/spatialNav";
import { listDirectory, type DirEntry } from "../api/libraryClient";
import "./FolderBrowser.css";

/**
 * In-app, gamepad-steerable folder picker. Reuses the Aurora modal shell so the
 * AppShell spatial-nav loop drives it for free (its rows are plain <button>s, and
 * navRoot() prefers `.aurora-modal__panel`). Shown only in controller mode —
 * mouse/keyboard users get the native OS dialog instead.
 */
export function FolderBrowser({
  initialPath,
  onSelect,
  onClose,
}: {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(initialPath ?? "");
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (p: string) => {
    try {
      const listing = await listDirectory(p);
      setPath(listing.path);
      setParent(listing.parent);
      setEntries(listing.entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load(initialPath ?? "");
  }, [load, initialPath]);

  // AppShell only seeds controller focus on route/details changes, so seed it
  // here whenever the listing changes (open + each folder we step into).
  useEffect(() => {
    if (document.body.classList.contains("using-controller") && panelRef.current) {
      focusFirst(panelRef.current);
    }
  }, [entries]);

  // Escape closes, matching the native dialog's cancel. Capture-phase + stop so
  // AppShell's global Escape (which would navigate home) doesn't also fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Portal to <body>: the modal is position:fixed, but ancestors with
  // backdrop-filter (e.g. the first-run wizard container) become its containing
  // block and trap it in their box. Body keeps `inset:0` anchored to the viewport.
  return createPortal(
    <div className="aurora-modal" onClick={onClose}>
      <div
        className="aurora-modal__panel folder-browser"
        role="dialog"
        aria-modal="true"
        aria-label="Select a folder"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="folder-browser__path" title={path}>
          {path || "Loading…"}
        </div>
        <div className="aurora-modal__body folder-browser__list">
          {parent && (
            <button
              type="button"
              className="folder-browser__row folder-browser__row--up"
              onClick={() => load(parent)}
            >
              ⬆ ..
            </button>
          )}
          {entries.map((d) => (
            <button
              key={d.path}
              type="button"
              className="folder-browser__row"
              onClick={() => load(d.path)}
            >
              📁 {d.name}
            </button>
          ))}
          {!parent && entries.length === 0 && !error && (
            <div className="folder-browser__empty">No subfolders here.</div>
          )}
          {error && <div className="folder-browser__error">{error}</div>}
        </div>
        <div className="folder-browser__actions">
          <button type="button" className="ui-button ui-button--small" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ui-button ui-button--primary ui-button--small"
            onClick={() => onSelect(path)}
            disabled={!path}
          >
            Select This Folder
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
