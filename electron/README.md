# Electron shell (Phase 2)

## Prereqs
Build the Rust sidecar first: `cd src-tauri && cargo build --bin xlm-core`

## Dev
`npm run electron:dev` — launches the window against the Vite renderer dev server.

## Headless smoke (CI/agent)
`npm run smoke` — boots Electron under xvfb, round-trips ping + load_settings + asset-deny, exits 0/1.

## Tests
`npm run test:electron` — Node unit tests for SidecarClient, protocol path validation, updater.

## Notes
- Renderer still uses @tauri-apps/* (Phase 3 rewires it to window.xlm).
- Packaging / AppImage / binary bundling is Phase 4.
