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
  convertFileSrc: (path: string) => `xlm-asset://local/${encodeURIComponent(path)}`,
})
