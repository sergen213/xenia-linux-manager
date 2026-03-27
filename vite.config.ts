import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],

  // Build optimizations for faster startup
  build: {
    rollupOptions: {
      output: {
        // Manual chunks function for vendor splitting
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) {
              return "vendor-react";
            }
            if (id.includes("@tauri-apps")) {
              return "vendor-tauri";
            }
          }
        },
      },
    },
    minify: "esbuild",
    sourcemap: false,
  },

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    // Tauri expects a fixed port; fail if that port is not available
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
});
