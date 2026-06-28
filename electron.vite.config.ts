import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      // Bundle electron-updater so Rollup's CJS plugin handles the interop;
      // without this, the ESM bundle would emit a bare named import from a CJS
      // package which Node.js rejects at runtime.
      externalizeDeps: { exclude: ['electron-updater'] },
      rollupOptions: { input: { index: resolve(__dirname, 'electron/main/index.ts') } }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    root: '.',
    plugins: [react()],
    // Pages are React.lazy()'d, so Vite's cold-start scan can miss deps that
    // only the lazy chunks import (e.g. lucide-react in the Library subtree).
    // First navigation then triggers "new deps optimized, reloading" — a
    // full-page reload stall. Pin them so they're pre-bundled up front, with
    // no runtime discovery or reload.
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', 'lucide-react']
    },
    // Eagerly transform the entry and the default (Library) route so first
    // paint doesn't wait on on-demand compilation.
    server: {
      warmup: { clientFiles: ['./src/main.tsx', './src/App.tsx', './src/features/library/LibraryPage.tsx'] }
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: { index: resolve(__dirname, 'index.html') } }
    }
  }
})
