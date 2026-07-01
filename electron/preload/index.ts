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
  updates: {
    check: () => ipcRenderer.invoke('xlm:update:check'),
    install: () => ipcRenderer.invoke('xlm:update:install'),
    getStatus: () => ipcRenderer.invoke('xlm:update:getStatus'),
    onStatus: (cb: (status: unknown) => void) => {
      const listener = (_e: unknown, status: unknown) => cb(status)
      ipcRenderer.on('xlm:update:status', listener)
      return () => ipcRenderer.removeListener('xlm:update:status', listener)
    },
  },
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
