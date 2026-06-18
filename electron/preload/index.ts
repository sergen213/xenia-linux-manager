import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('xlm', {
  invoke: (method: string, params?: object) => ipcRenderer.invoke('xlm:invoke', method, params),
  on: (event: string, cb: (payload: unknown) => void) => {
    const listener = (_e: unknown, msg: { event: string; payload: unknown }) => {
      if (msg.event === event) cb(msg.payload)
    }
    ipcRenderer.on('xlm:event', listener)
    return () => ipcRenderer.removeListener('xlm:event', listener)
  },
  openDialog: (opts: object) => ipcRenderer.invoke('xlm:openDialog', opts),
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
  win: {
    minimize: () => ipcRenderer.invoke('xlm:win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('xlm:win:toggleMaximize'),
    close: () => ipcRenderer.invoke('xlm:win:close'),
    isMaximized: () => ipcRenderer.invoke('xlm:win:isMaximized'),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      const listener = (_e: unknown, maximized: boolean) => cb(maximized)
      ipcRenderer.on('xlm:win:maximize-changed', listener)
      return () => ipcRenderer.removeListener('xlm:win:maximize-changed', listener)
    },
  },
})
