/**
 * Platform bridge — the renderer's single seam to the Electron host.
 *
 * Provides drop-in replacements for the former `@tauri-apps/*` runtime APIs,
 * backed by the `window.xlm` contextBridge surface defined in
 * `electron/preload/index.ts`. Consumers import from here instead of Tauri, so
 * the host-specific shape adaptations (event subscription, file dialog) live in
 * exactly one place.
 */

export interface XlmBridge {
  invoke<T = unknown>(method: string, params?: object): Promise<T>;
  /** Subscribe to a host event; returns a synchronous unsubscribe. */
  on(event: string, cb: (payload: unknown) => void): () => void;
  convertFileSrc(path: string): string;
  openDialog(opts: object): Promise<{ canceled: boolean; filePaths: string[] }>;
}

declare global {
  interface Window {
    xlm: XlmBridge;
  }
}

/**
 * Invoke a sidecar command. Mirrors Tauri's `invoke`. Params are forwarded
 * verbatim through IPC to the sidecar, which deserializes them by camelCase key
 * (the convention the clients already use).
 */
export function invoke<T = unknown>(
  method: string,
  params?: object,
): Promise<T> {
  return window.xlm.invoke<T>(method, params);
}

/** Drop-in for Tauri's `UnlistenFn`. */
export type UnlistenFn = () => void;

/**
 * Subscribe to a sidecar event. Mirrors Tauri's `listen`: returns a
 * `Promise<UnlistenFn>` and delivers `{ payload }` to the handler, so existing
 * `(event) => event.payload` call sites keep working over `window.xlm.on`
 * (which is synchronous and delivers the bare payload).
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

/** Mirrors Tauri's `convertFileSrc` — resolves a local path to an asset URL. */
export function convertFileSrc(path: string): string {
  return window.xlm.convertFileSrc(path);
}

/** Options accepted by `open` — the subset of Tauri's dialog API in use. */
export interface OpenDialogOptions {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
}

/**
 * Open a native file/folder picker. Mirrors Tauri's plugin-dialog `open`:
 * resolves to the selected path, an array when `multiple`, or `null` when
 * cancelled. Translates Tauri-style options to Electron dialog properties and
 * the `{ canceled, filePaths }` result back to the Tauri return shape.
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
