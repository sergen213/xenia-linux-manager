/**
 * Platform bridge — the renderer's single seam to the Electron host.
 *
 * Exposes `invoke` / `listen` / `convertFileSrc` / `open` backed by the
 * `window.xlm` contextBridge surface defined in `electron/preload/index.ts`.
 * Consumers import from here, so the host-specific shape adaptations (event
 * subscription, file dialog) live in exactly one place.
 */

/**
 * Window-control surface (frameless custom title bar). Optional: absent in the
 * browser / themed-preview where no Electron host is attached.
 */
export interface WinControls {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Subscribe to host-driven maximize-state changes; returns an unsubscribe. */
  onMaximizeChange(cb: (maximized: boolean) => void): () => void;
}

export interface XlmBridge {
  invoke<T = unknown>(method: string, params?: object): Promise<T>;
  /** Subscribe to a host event; returns a synchronous unsubscribe. */
  on(event: string, cb: (payload: unknown) => void): () => void;
  convertFileSrc(path: string): string;
  openDialog(opts: object): Promise<{ canceled: boolean; filePaths: string[] }>;
  win?: WinControls;
}

declare global {
  interface Window {
    xlm: XlmBridge;
  }
}

/**
 * Invoke a sidecar command. Params are forwarded verbatim through IPC to the
 * sidecar, which deserializes them by camelCase key (the convention the clients
 * already use).
 */
export function invoke<T = unknown>(
  method: string,
  params?: object,
): Promise<T> {
  return window.xlm.invoke<T>(method, params);
}

/** Handle returned by `listen`; call it to unsubscribe. */
export type UnlistenFn = () => void;

/**
 * Subscribe to a sidecar event. Returns a `Promise<UnlistenFn>` and delivers
 * `{ payload }` to the handler, adapting `window.xlm.on` (which is synchronous
 * and delivers the bare payload) so `(event) => event.payload` call sites work.
 */
export function listen<T = unknown>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  const unlisten = window.xlm.on(event, (payload) =>
    handler({ payload: payload as T }),
  );
  return Promise.resolve(unlisten);
}

/** Resolve a local file path to an `xlm-asset://` URL the renderer can load. */
export function convertFileSrc(path: string): string {
  return window.xlm.convertFileSrc(path);
}

/** Options accepted by `open` — the subset of the dialog API in use. */
export interface OpenDialogOptions {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
}

/**
 * Open a native file/folder picker: resolves to the selected path, an array
 * when `multiple`, or `null` when cancelled. Translates the options to Electron
 * dialog properties and maps the `{ canceled, filePaths }` result back.
 */
export async function open(
  opts: OpenDialogOptions = {},
): Promise<string | string[] | null> {
  const properties: string[] = [opts.directory ? "openDirectory" : "openFile"];
  if (opts.multiple) properties.push("multiSelections");
  const result = await window.xlm.openDialog({
    properties,
    title: opts.title,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return opts.multiple ? result.filePaths : result.filePaths[0];
}

/** True when the Electron host exposes window controls (frameless title bar). */
export function hasWindowControls(): boolean {
  return typeof window.xlm?.win !== "undefined";
}

/** Minimize the host window. No-op when window controls are unavailable. */
export function windowMinimize(): Promise<void> {
  return window.xlm?.win?.minimize() ?? Promise.resolve();
}

/** Toggle maximize/restore on the host window. No-op when unavailable. */
export function windowToggleMaximize(): Promise<void> {
  return window.xlm?.win?.toggleMaximize() ?? Promise.resolve();
}

/** Close the host window. No-op when unavailable. */
export function windowClose(): Promise<void> {
  return window.xlm?.win?.close() ?? Promise.resolve();
}

/** Current maximized state; false when controls are unavailable. */
export function windowIsMaximized(): Promise<boolean> {
  return window.xlm?.win?.isMaximized() ?? Promise.resolve(false);
}

/**
 * Subscribe to maximize-state changes; returns a synchronous unsubscribe.
 * Returns a no-op unsubscribe when controls are unavailable.
 */
export function onWindowMaximizeChange(
  cb: (maximized: boolean) => void,
): () => void {
  return window.xlm?.win?.onMaximizeChange(cb) ?? (() => {});
}
