export interface WinControls {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  onMaximizeChange(cb: (maximized: boolean) => void): () => void
}

export interface XlmBridge {
  invoke<T = unknown>(method: string, params?: object): Promise<T>
  on(event: string, cb: (payload: unknown) => void): () => void
  convertFileSrc(path: string): string
  openDialog(opts: object): Promise<{ canceled: boolean; filePaths: string[] }>
  win: WinControls
}
declare global { interface Window { xlm: XlmBridge } }
