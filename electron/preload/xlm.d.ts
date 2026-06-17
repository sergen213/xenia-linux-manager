export interface XlmBridge {
  invoke<T = unknown>(method: string, params?: object): Promise<T>
  on(event: string, cb: (payload: unknown) => void): () => void
  // convertFileSrc: Task 4; openDialog: Task 5
  convertFileSrc(path: string): string
  openDialog(opts: object): Promise<{ canceled: boolean; filePaths: string[] }>
}
declare global { interface Window { xlm: XlmBridge } }
