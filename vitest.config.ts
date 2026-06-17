import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // Renderer suite only. `electron/**` is a separate node-env project
    // (vitest.electron.config.ts, run via `npm run test:electron`); globbing it
    // here would load main-process modules in jsdom without the electron alias.
    // `.claude/**` holds stale worktree copies of this suite the agent harness
    // leaves behind — never glob into either.
    exclude: [...configDefaults.exclude, "**/electron/**", "**/.claude/**"],
  },
});
