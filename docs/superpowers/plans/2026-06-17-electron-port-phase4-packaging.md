# Phase 4 Plan — Packaging + Cutover

Spec: `docs/superpowers/specs/2026-06-17-electron-port-phase4-packaging-design.md`

## Task 1 — electron-builder config + scripts (`package.json`)

Expand `build`:
```jsonc
"build": {
  "appId": "com.xenia-linux-manager.app",
  "productName": "Xenia Manager for Linux",
  "directories": { "output": "release", "buildResources": "build" },
  "files": ["out/**/*", "package.json"],
  "extraResources": [{ "from": "src-tauri/target/release/xlm-core", "to": "xlm-core" }],
  "linux": { "target": ["AppImage"], "category": "Game", "icon": "build/icon.png" },
  "publish": [{ "provider": "github", "owner": "REPLACE_OWNER", "repo": "xenia-linux-manager" }]
}
```
Scripts: add `build:sidecar`, `dist`, `pack`; repoint `dev`/`build`/`preview`
to `electron-vite`; drop redundant `electron:*` dupes; remove `release:manifest`.

## Task 2 — Icon

`mkdir build && magick src-tauri/icons/128x128@2x.png -resize 512x512 build/icon.png`
(verify ≥512 with `magick identify`).

## Task 3 — Fix `protocol.test.ts`

- Add `electron/main/__tests__/__fixtures__/electron-stub.ts` exporting
  import-safe no-op `protocol`, `net`, `app`, `BrowserWindow`, `dialog`,
  `ipcMain`.
- `vitest.electron.config.ts`: `resolve: { alias: { electron: <stub> } }`.
- Confirm all three electron test files pass.

## Task 4 — Delete Tauri scaffolding

`git rm -r` tracked: `src-tauri/tauri.conf.json`, `src-tauri/capabilities`,
`src-tauri/gen`, `src-tauri/icons`, `patch_tauri_conf_scope.py`,
`vite.config.ts`, `scripts/generate-updater-manifest.mjs`. `rm -rf dist`.

## Task 5 — Retarget release tooling + docs

- `verify-appimage-release.sh`: default dir → `release/`; build hint → `npm run dist`.
- `appimage-verification-checklist.md`: Tauri build line → `npm run dist` / `release/`.
- `electron/README.md` (or root): document `npm run dist` / `pack` flow + the
  `build:sidecar` prereq + the env unzip caveat.

## Task 6 — Worktree + vitest hygiene

- `git worktree remove --force .claude/worktrees/agent-ad0b89564b4c0e061` (+ afd4…);
  `git branch -D worktree-agent-ad0b… worktree-agent-afd4…`; `git worktree prune`.
- `vitest.config.ts`: add `exclude: [...configDefaults.exclude, '**/.claude/**']`.

## Task 7 — Verify

1. `npx tsc -b` clean.
2. `npx vitest run` green; bare run excludes `.claude/**`.
3. `npx vitest run --config vitest.electron.config.ts` green (protocol incl.).
4. `grep -rn @tauri-apps src/ electron/` → empty; `grep -rn tauri` for dangling refs.
5. Toolchain (best-effort): `npm install` + unzip recovery → `electron-vite build`
   produces `out/{main,preload,renderer}` → `electron-builder --dir` validates layout.
   On sandbox/network failure: offline config-shape check + document.
6. Adversarial multi-lens review workflow over the full diff.
