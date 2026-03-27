# Phase 8 Research: Packaging and Release Hardening

**Researched:** 2026-03-13
**Phase:** 8 - Packaging and Release Hardening
**Requirements:** APP-02

## Question

What does Phase 8 need so Xenia Manager for Linux ships as a trustworthy AppImage, exposes the right Linux-native release metadata and warnings inside the app, and has a release checklist that can block shipment if packaged workflows regress?

## Recommended Technical Direction

### Treat the AppImage as the primary shipped artifact, not a side effect of `tauri build`

- The repo already uses Tauri 2 bundling, but `src-tauri/tauri.conf.json` is still at the default `targets: "all"` shape with no Linux-specific AppImage customization.
- Phase 8 should make the release contract explicit in Tauri config:
  - set Linux-focused bundle metadata and naming around `Xenia Manager for Linux`
  - add Linux AppImage custom files where needed under `bundle.linux.appimage.files`
  - ensure desktop metadata, icons, and any packaged helper assets are included deliberately instead of relying on defaults
- The packaging output should be one public AppImage release track for v1, matching the locked context.

### Use the Tauri v2 updater path only if it is fully configured and signed

- Current codebase has no updater plugin or updater config yet.
- Official Tauri v2 docs indicate Linux updater reuse is AppImage-based and requires:
  - `bundle.createUpdaterArtifacts: true`
  - `plugins.updater.pubkey`
  - `plugins.updater.endpoints`
  - signed AppImage artifacts and generated `.sig` files
- If Phase 8 promises in-app update handling, it needs the full stack:
  - Rust plugin registration (`tauri-plugin-updater`)
  - frontend bindings (`@tauri-apps/plugin-updater`)
  - relaunch or restart handling, typically via the process plugin after install
  - a release-manifest generation step for published artifacts
- The context says updates should be automatic but still confirmed by the user. That means the app should check automatically, present release notes and build/version details, then require explicit confirmation before `downloadAndInstall`.

### Add packaged-build awareness as a first-class app state, not scattered ad hoc checks

- The current shell and settings surfaces do not expose packaged-build metadata, release notes, or environment status.
- Phase 8 should add a backend-owned release or runtime module that reports:
  - app version
  - build channel or packaging kind (`dev`, `packaged-appimage`)
  - architecture and target triple
  - release notes URL if available
  - packaged-environment diagnostics relevant to Linux desktop use
- Renderer code should consume this through one typed contract so:
  - the status bar can show version/build context
  - settings can show release metadata and update state
  - warnings can explain why AppImage sandbox or desktop integration constraints matter

### Keep Linux trust and safety messaging plain, expandable, and non-blocking by default

- The phase context is explicit:
  - explain why user-selected folders are needed
  - risky or unsupported environments should warn, not hard-block
  - technical details stay behind expandable disclosure by default
- That suggests packaged-environment checks should classify findings into:
  - informational
  - warning
  - blocking only when core app operation is impossible
- Good examples for Phase 8:
  - desktop integration unavailable or declined
  - missing write permission to user-chosen paths
  - unsupported or unusual execution context
  - updater unavailable because release metadata is missing

### Desktop integration should be explicit and recoverable

- The context requires a first-launch desktop integration prompt for the AppImage.
- The implementation should avoid a one-shot prompt with no return path.
- Phase 8 should define:
  - first-packaged-launch detection
  - a user prompt that explains what integration does
  - persistent choice tracking
  - a Settings entry to retry or review integration state later
- File-association or “Open With” support should stay pragmatic: include the metadata and entry points that are feasible for AppImage-compatible desktop integration without overpromising deep OS integration.

### Release automation should generate both publishable artifacts and an internal verification package

- The context says verification evidence is internal only, but release verification is still release-blocking.
- Phase 8 should produce:
  - deterministic build command(s) for the AppImage
  - signed update artifacts if updater is enabled
  - generated release metadata or manifest
  - an internal manual checklist for packaged-form verification
- The release automation does not need to fully publish to a remote service in this phase, but it should leave behind a repeatable path that creates all required artifacts for a human to publish.

### The verification pass must be broader than “AppImage launches”

- `APP-02` is only satisfied if the packaged build preserves the product’s core flows in packaged form.
- The checklist must cover:
  - first launch and desktop integration prompt
  - install or update flow
  - library scan flow
  - game launch flow
  - patch and profile management flows
  - save import and export flows
  - version/build info and release notes visibility
  - update prompt behavior for packaged builds
- Because earlier phases own those workflows, Phase 8 should treat the packaged verification pass as cross-phase release hardening, not as a narrow packaging script.

## Tauri v2 Facts That Matter For Planning

- Official Tauri docs show Linux AppImage custom file injection under `bundle.linux.appimage.files`.
- Official Tauri docs show updater configuration belongs in `tauri.conf.json` via `bundle.createUpdaterArtifacts` plus `plugins.updater.pubkey` and `plugins.updater.endpoints`.
- Official Tauri docs show Linux updater artifacts reuse the AppImage itself and generate a matching `.sig` file.
- Official plugin docs show the updater plugin requires Rust backend registration and frontend bindings for check, install, and restart flows.

These facts make updater work a packaging concern, not a later optional polish item.

## Planning Implications

### Plan split

The roadmap’s two plans should stay distinct:

1. **Create AppImage packaging, metadata, and release automation**
   - Tauri config hardening for Linux AppImage
   - updater plugin and signed artifact generation
   - release/build metadata contract
   - desktop integration and packaged-runtime plumbing
   - repeatable release build scripts or workflow
2. **Run packaged-app verification and release hardening pass**
   - packaged UI surfaces for build info, release notes, and warnings
   - internal release checklist and smoke procedure
   - non-blocking environment diagnostics
   - manual packaged-flow verification across install, scan, launch, patch/profile, and saves
   - final hardening fixes discovered in packaged form

### Dependency shape

- Plan `08-01` should run first because it creates the packaged artifact, updater contract, and release metadata that the verification pass depends on.
- Plan `08-02` should depend on `08-01` because packaged-form verification is meaningless until there is a deliberate AppImage build and release contract to test.

That yields a clean execution order:
- Wave 1: `08-01`
- Wave 2: `08-02`

## User Decision Constraints To Preserve

- Ship a single public AppImage release track for v1.
- Include in-app update handling only with user confirmation before install.
- Prompt for desktop integration on first packaged launch.
- Surface packaged branding as `Xenia Manager for Linux`.
- Show version/build information and a release notes link in the packaged experience.
- Explain folder and path access in plain language.
- Warn on risky or unsupported packaged environments instead of hard-blocking when recovery is possible.
- Hide technical details behind an expandable section by default.
- Keep release verification evidence internal only.
- Block release if packaged verification finds issues in install, scan, launch, patch/profile, save, or desktop integration workflows.

## Risks And Mitigations

### Risk: The updater is half-configured and the packaged app advertises updates that cannot install safely

- Mitigation: treat updater enablement as all-or-nothing inside Plan `08-01`; no UI affordance should ship without signed artifacts, public key, endpoints, and relaunch handling wired end to end.

### Risk: The AppImage works technically but feels like an anonymous dev build

- Mitigation: add a backend release metadata contract and renderer surfaces for version, build kind, architecture, release notes, and packaged-environment status.

### Risk: Desktop integration prompts become naggy or irreversible

- Mitigation: track first-launch choice, allow later retry from Settings, and keep the prompt informative rather than coercive.

### Risk: Packaging introduces Linux-specific permission or path confusion for normal users

- Mitigation: surface packaged-environment warnings in plain language with collapsed technical detail and tie all path explanations back to user-selected folders.

### Risk: Phase 8 only validates startup while deeper workflows fail in packaged form

- Mitigation: require an internal manual verification checklist that explicitly covers install, scan, launch, patch/profile, save, updater behavior, and desktop integration.

## Verification Guidance

- Prefer focused checks in this phase:
  - `npm run build`
  - `npm run tauri build -- --bundles appimage`
  - `cargo test --manifest-path src-tauri/Cargo.toml release`
  - `npm run test -- --run src/components/app-shell src/features/settings src/features/xenia`
- Add automated checks for:
  - release metadata command payloads
  - packaged-environment classification logic
  - updater state handling and confirmation gating
  - settings and status-bar rendering of build info and release notes
- Add manual packaged verification for:
  - first AppImage launch
  - desktop integration prompt and persistence
  - install/update flow
  - library scan
  - launch flow
  - patch/profile flow
  - save export/import
  - update prompt and release notes visibility

## Outcome For Planning

Phase 8 should leave the project with a real Linux release path: a signed and metadata-rich AppImage build, a packaged-build runtime contract the UI can explain clearly, and a release-blocking verification procedure that validates the app as shipped instead of assuming earlier phase behavior survives packaging unchanged.
