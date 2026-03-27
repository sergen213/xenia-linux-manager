# Phase 6 Research: Profiles and Community Settings

**Researched:** 2026-03-13
**Phase:** 6 - Profiles and Community Settings
**Requirements:** PROF-01, PROF-02, PROF-03, PROF-04, LAUN-02

## Question

What does Phase 6 need so per-game Xenia configuration profiles are safe to manage locally, easy to understand in both explicit and effective forms, and composable with Phase 5 patches during launch without locking the project into a fake community-profile source?

## Recommended Technical Direction

### Treat profiles as backend-owned per-game assets under library metadata

- Profile state should live under `library_metadata_path`, not inside the mutable Xenia install tree.
- Use a canonical per-game profile area such as:
  - `library_metadata_path/profiles/{game_id}/manifest.json`
  - `library_metadata_path/profiles/{game_id}/profiles/{profile_id}.json`
  - `library_metadata_path/profiles/{game_id}/active.json`
- The profile manifest should track:
  - profile id
  - profile name
  - source or provenance (`local`, future-compatible `recommended`)
  - created and updated timestamps
  - active-selection status
  - last materialized effective-config hash
- This keeps profile choices stable across Xenia reinstall or update flows from Phase 2 and aligns with the Phase 5 decision that patch state also belongs in library metadata.

### Model profiles as sparse explicit values plus backend-computed effective config

- The context is clear that removing a value should restore inheritance, not store an empty override.
- The safest representation is a sparse set of explicit overrides keyed by config path, with the backend computing:
  - explicit-value view
  - effective merged config
  - changed-field summary against defaults
- Merge precedence should be:
  1. Xenia default base config
  2. any app-owned recommended baseline that is actually available for the current title
  3. active local profile explicit overrides
- This preserves the required truth that local overrides win over defaults while making the effective view deterministic.

### Keep profile storage and source provenance separate from edit state

- The app should distinguish:
  - the profile's editable explicit values
  - metadata about where the profile came from
  - the derived effective config shown to the user or used at launch
- Even if the product stays local-only for now, provenance still matters because Phase 6 context and roadmap disagree about community support.
- A provenance-aware model lets the project add a real recommended-settings source later without rewriting the local profile editor.

### Reconcile the roadmap/context mismatch by building a source seam, not a fake feature

- `PROF-02` and the roadmap still mention community-optimized settings, but the locked Phase 6 context says active planning should remain local-profile focused until a real source exists.
- The clean reconciliation is:
  - do not build placeholder community tabs, buttons, or empty catalog UI
  - do add a backend source seam and provenance tracking so a real recommended-profile source can be normalized later
  - only surface a recommendation affordance if the backend can resolve an actual supported profile for the current title
- That means Phase 6 can leave behind a real extension point instead of a dead-end local-only model, while still honoring the context decision to avoid pretending community support exists in v1.

### Use a schema-guided editor for common settings and a raw editor for advanced keys

- The standard editor should be field-driven for the settings that matter most to players.
- A raw editor should operate on the same explicit-value document rather than owning a separate config model.
- The editor contract needs field metadata for:
  - label
  - key path
  - type
  - optional enum or range info
  - whether the field is currently inherited or explicitly set
- The detail page should be able to show:
  - active profile name
  - changed-field count
  - key changed settings summary
  - toggle between explicit-only and effective-config views

### Launch should materialize a derived config artifact, not mutate global Xenia state

- `LAUN-02` requires launch to apply the selected patch and effective profile together.
- The safest contract is for the backend launch path to materialize the effective config into a derived per-launch or per-game config file, then launch Xenia against that materialized state.
- Launch composition should:
  - load the selected game identity from Phase 4
  - load the active patch selection from Phase 5
  - load the active profile and compute effective config from Phase 6
  - validate the combined launch inputs
  - materialize or refresh the effective config artifact before process spawn
- This avoids mutating a user's long-lived global Xenia config unexpectedly while still making the resulting launch state inspectable.

## Planning Implications

### Plan split

The roadmap's three plans should stay distinct, but Plan `06-02` needs to acknowledge the context mismatch explicitly:

1. **Profile storage, merge rules, and effective-settings computation**
   - backend profile storage and selection
   - sparse override model
   - effective-config computation
   - explicit-versus-effective read models
2. **Recommended-settings source seam and provenance tracking**
   - provenance-aware profile metadata
   - backend normalization contract for recommended profiles
   - actual-source gating with no placeholder UI
   - import or apply flow only when a supported recommendation exists
3. **Profile editor UI and launch-time config application**
   - standard plus raw editors
   - unsaved-change handling
   - detail-view summaries and explicit/effective toggles
   - launch materialization alongside active patch state

### Dependency shape

- Plan `06-01` should run first because it defines the backend-owned profile and effective-config contract everything else consumes.
- Plan `06-02` should depend on `06-01` because provenance and any future recommended-profile support must normalize into the same profile model rather than inventing a parallel one.
- Plan `06-03` should depend on both `06-01` and `06-02` because the editor and launch flow should render source metadata consistently and consume the final profile merge contract.

That yields a clean execution order:
- Wave 1: `06-01`
- Wave 2: `06-02`
- Wave 3: `06-03`

## User Decision Constraints To Preserve

- The app should feel like local profile management, not a remote profile marketplace.
- A game can have multiple named local profiles.
- Profile names must be unique within a game.
- If a game has no profiles yet, the user starts from a blank per-game profile.
- The UI must show both explicit profile values and the full effective config.
- The UI needs a toggle between explicit-only and effective-config views.
- Effective settings should be visible in both the profile editor and the game detail page.
- Changed fields should be highlighted, but a full side-by-side diff is not required.
- Before launch, the UI should show the active profile name plus key changed settings.
- The standard editor should use labeled fields.
- A raw editor should exist for direct key editing.
- Removing a value means revert to inherited/default behavior.
- Unsaved edits require a leave-warning flow.
- Renaming an active profile must prompt about how active selection is handled.
- No placeholder community tabs, buttons, or dead-end affordances should appear in v1.

## Risks And Mitigations

### Risk: Local profile edits become coupled to Xenia's mutable install directory

- Mitigation: store canonical profile documents and derived metadata under `library_metadata_path`, and treat any launch-time config file inside Xenia state as generated output.

### Risk: The UI cannot explain why a setting appears active when the user did not set it explicitly

- Mitigation: persist sparse explicit overrides only, compute the effective config in the backend, and expose both explicit and effective payloads with field-level changed markers.

### Risk: The project ships fake community-profile UI without a trustworthy source

- Mitigation: add only a provenance-aware backend seam and conditionally render any recommendation affordance when a real supported profile exists; otherwise keep the product local-only.

### Risk: Launch-time config composition drifts apart from patch and library state

- Mitigation: make Phase 6 launch composition backend-owned and explicitly load game identity, patch selection, and effective profile state in one preflight path.

### Risk: The standard editor and raw editor diverge into separate sources of truth

- Mitigation: have both editors read and write the same sparse explicit-value profile document, with the backend remaining the only place that computes the effective merged config.

## Verification Guidance

- Prefer focused automated checks per plan:
  - `cargo test --manifest-path src-tauri/Cargo.toml profiles::storage`
  - `cargo test --manifest-path src-tauri/Cargo.toml profiles::sources`
  - `cargo test --manifest-path src-tauri/Cargo.toml library::launch profiles::materialize`
  - `npm run test -- --run src/features/library/state src/features/library/api`
  - `npm run test -- --run src/features/library/components`
  - `npm run build`
- Add Rust tests for:
  - unique-name enforcement per game
  - sparse override merge precedence
  - explicit versus effective config generation
  - active-profile selection and rename behavior
  - recommended-profile normalization and unsupported-source gating
  - launch-time materialization with active patch plus profile state
- Add renderer tests for:
  - explicit/effective toggle rendering
  - labeled editor and raw editor coherence
  - unsaved-change leave protection
  - changed-field highlighting and summary chips
  - conditional recommendation affordance only when a supported recommendation exists

## Outcome For Planning

Phase 6 should leave the project with a durable profile-management contract: per-game profiles are local-first, easy to inspect in explicit and effective forms, safe to compose into launch-time Xenia config, and future-compatible with a real recommended-settings source without forcing the app to ship fake community features today.
