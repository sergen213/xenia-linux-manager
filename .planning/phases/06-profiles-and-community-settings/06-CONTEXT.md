# Phase 6: Profiles and Community Settings - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver per-game configuration profile management for Xenia using local profiles in the manager. Users can create and switch between named profiles, inspect effective settings, edit settings before launch, and launch games with the selected patch and active profile applied together.

Community profile fetching should not be planned as active implementation work for this phase. The roadmap/requirements mention it, but the current product direction is local profiles only unless a real source is identified later.

</domain>

<decisions>
## Implementation Decisions

### Profile model and selection
- The UI should treat profiles as local profiles only.
- Users should switch between full profiles rather than working from a base profile plus local overrides model.
- If a game has no existing profile, the user starts from a blank per-game profile.
- A game can have multiple named local profiles.
- Profile names must be unique within a game; duplicate names are not allowed.

### Effective settings visibility
- Users should be able to view both explicitly set profile fields and the full effective config.
- The UI should provide a toggle between explicit profile values and full effective config.
- Effective settings should be visible both inside the profile editor and on the game detail page.
- Changed fields should be highlighted; a full side-by-side default comparison is not required.
- Before launch, the UI should show the active profile name plus key changed settings.

### Editing workflow
- The primary editor should use labeled fields.
- An advanced raw editor should also be available for direct key editing.
- Removing a value from a profile means the setting inherits the default rather than becoming explicitly empty.
- If the user navigates away with unsaved edits, the app should warn before leaving.
- Renaming an active profile should prompt the user to decide how the active-profile reference is handled.

### Community settings scope
- Community profile fetching is out of scope for active planning in this phase.
- The profile UI should not show placeholder Community tabs, buttons, or affordances in v1.
- Any future shared-profile support is deferred and still undecided on whether it should behave as file/data import into local profiles or something else.

### Claude's Discretion
- Exact labeled fields shown in the standard editor
- Exact set of "key changed settings" shown before launch
- Visual treatment of changed-field highlighting
- Exact copy for unsaved-changes and rename prompts

</decisions>

<specifics>
## Specific Ideas

- The product should feel like local profile management, not a synced or remote profile catalog.
- Advanced users should have access to raw config editing without making raw keys the default experience.
- Effective settings need to be understandable in two modes: what the profile explicitly sets and what the launch will actually use.

</specifics>

<deferred>
## Deferred Ideas

- Revisit the roadmap/requirements language around community-optimized settings, since no real online source is currently known.
- If a viable shared-profile source is identified later, treat it as future backlog work rather than part of current phase 6 planning.

</deferred>

---

*Phase: 06-profiles-and-community-settings*
*Context gathered: 2026-03-13*
