# Electron host

The app runs as an Electron shell over the `xlm-core` Rust sidecar. The React
renderer talks to the main process through the `window.xlm` contextBridge
(`electron/preload`), and main proxies to the sidecar over stdio
(`electron/main/sidecar.ts`).

## Prereqs

Build the Rust sidecar first:

```bash
npm run build:sidecar      # cd core && cargo build --release --bin xlm-core
```

Dev resolves the binary from `core/target/{release,debug}/xlm-core`;
packaged builds resolve it from `<resources>/xlm-core` (see
`electron/main/paths.ts`).

## Dev

```bash
npm run dev                # electron-vite dev — window against the Vite renderer dev server
```

> Env caveat: on this machine `npm install` does not extract the Electron
> binary. If `electron-vite dev`/`preview` reports `Error: Electron uninstall`,
> recover with:
> ```bash
> unzip -oq ~/.cache/electron/*/electron-v*-linux-x64.zip -d node_modules/electron/dist \
>   && printf electron > node_modules/electron/path.txt
> ```
> `electron-vite build` does **not** need the binary.

## Build & package

```bash
npm run build              # tsc -b && electron-vite build  -> out/{main,preload,renderer}
npm run pack               # build + electron-builder --dir  (unpacked, for inspection)
npm run dist               # build:sidecar + build + electron-builder --linux AppImage -> release/
```

electron-builder config lives in `package.json` `build`:
- `xlm-core` is bundled via `extraResources` (outside the asar, so it stays a
  real spawnable file) and lands at `<resources>/xlm-core`.
- Output AppImage goes to `release/`. The app icon is `build/icon.png` (512×512).
- `publish` is a GitHub-provider scaffold with a placeholder `owner`; the
  auto-updater (`electron/main/updater.ts`) is graceful-inert until a real feed
  exists. electron-builder generates the `latest-linux.yml` update manifest
  itself — there is no separate manifest script.

Verify a built AppImage with `bash scripts/verify-appimage-release.sh` and the
release gate at `docs/release/appimage-verification-checklist.md`.

## Headless smoke (CI/agent)

```bash
npm run smoke              # boots Electron under xvfb, round-trips ping + load_settings + asset-deny, exits 0/1
```

## Tests

```bash
npm run test:electron      # node-env unit tests: SidecarClient, protocol path validation, updater
```

The `electron/**` tests run under a node-env vitest project
(`vitest.electron.config.ts`) that aliases the bare `electron` import to an
import-safe stub (`electron/main/__tests__/__fixtures__/electron-stub.ts`).
