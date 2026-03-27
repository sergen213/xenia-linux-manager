# Phase 8: Packaging and Release Hardening - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Package Xenia Manager for Linux as an AppImage for general Linux desktop users and verify that the packaged build is release-ready. This phase covers packaging, desktop integration, update behavior, packaged-build safety messaging, and packaged-form verification of the existing core workflows. New product capabilities remain out of scope.

</domain>

<decisions>
## Implementation Decisions

### Release channel and update posture
- Ship a single public AppImage release track for v1.
- The packaged app should include in-app update handling.
- Updates should be automatic, but the user must be warned and asked for confirmation before the update proceeds.
- Release posture is for general use, not beta or early access messaging.

### Desktop integration and install experience
- On first launch from the AppImage, prompt the user about desktop integration.
- Use `Xenia Manager for Linux` as the packaged app name in desktop metadata and surfaced packaged-build branding.
- Support both normal app launch and desktop/file-manager "Open With" style entry points where practical for the packaged build.
- Include packaged-build touches in the UI, including version/build information, a release notes link, and packaged-environment checks.

### Packaged-app trust and safety messaging
- Explain in plain language why the app needs access to user-selected folders and paths.
- Risky or unsupported environment issues should warn the user and explain why, rather than hard-blocking the action.
- Warning and error technical details should be hidden behind an expandable section by default.

### Release verification expectations
- Release verification must be performed manually against the AppImage build.
- All major packaged workflows are release-blocking: install/update, library scan, launch, patch/profile handling, save import/export, and desktop integration.
- Verification evidence should be captured as an internal checklist only.
- If an issue appears in the packaged build, release is blocked until it is fixed.

### Claude's Discretion
- Exact scope of confirmation messaging around updates versus other non-destructive operations.
- Specific wording, timing, and visual treatment of desktop integration prompts.
- Exact implementation of file association or "Open With" support in AppImage-compatible desktop metadata.

</decisions>

<specifics>
## Specific Ideas

- Keep the packaged experience explicitly Linux-native rather than using generic cross-platform release presentation.
- The packaged build should surface enough release metadata that users can tell what build they are running and where to find release notes.
- Safety messaging should stay approachable for general users while still preserving expandable technical detail for troubleshooting.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 08-packaging-and-release-hardening*
*Context gathered: 2026-03-13*
