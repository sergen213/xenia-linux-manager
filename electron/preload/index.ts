import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('xlm', {
  // filled in Task 3+
})
