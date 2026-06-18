---
name: Xenia Linux Manager
description: Calm graphite cockpit with a heritage-green signal for managing the Xenia emulator on Linux
colors:
  heritage-jade: "#3fc488"
  jade-light: "#66d3a2"
  graphite: "#18181b"
  slate: "#1e1e22"
  pit: "#121214"
  panel: "#232328"
  hover: "#2e2e34"
  seam: "#34343c"
  frost: "#ececee"
  haze: "#b8b8c0"
  dim: "#9b9ba3"
  signal-green: "#6fc79a"
  amber-alert: "#e0a33e"
  fault-red: "#e5675f"
typography:
  title:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  subtitle:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  caption:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.frost}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.9rem"
  button-primary-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.frost}"
  button-accent:
    backgroundColor: "{colors.heritage-jade}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
  button-danger:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fault-red}"
    rounded: "{rounded.md}"
  button-small:
    rounded: "{rounded.md}"
    padding: "0.38rem 0.7rem"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.frost}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.pit}"
    textColor: "{colors.frost}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.5rem"
  sidebar-link:
    textColor: "{colors.haze}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  sidebar-link-active:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.heritage-jade}"
---

# Design System: Xenia Linux Manager

## 1. Overview

**Creative North Star: "The Graphite Cockpit"**

This is an instrument panel for running Xbox 360 games on Linux — a calm, dark
cockpit the user reads at a glance, not a screen they have to study. The field is
neutral **graphite**, not navy: depth comes from three tonal steps of warm-neutral
grey — the sidebar sits at the bottom (Pit `#121214`), the app canvas a shade up
(Graphite `#18181b`), and lifted panels float clearly above it (Panel `#232328`).
The single live readout is **Heritage Jade** (`#3fc488`) — a muted, mineral green
that nods to the Xbox platform without shouting it. It marks the action you can
take, the route you're on, the field you're editing, the state that's healthy.
Nothing else competes for that signal.

The earlier identity leaned on navy + a bright cyan accent — the first-order
training-data reflex for "calm technical tool," guessable from the category alone.
This system deliberately leaves that lane: graphite kills the navy tell, and a
*desaturated* heritage green is meaningful (the platform) rather than arbitrary,
while staying far from RGB-gamer neon.

The system serves a mixed audience that leans novice, so it prizes legibility and
honest state over flourish. Status is loud; chrome is quiet. It explicitly rejects
the two failure modes named in PRODUCT.md: the cramped "cheat engine" mod-tool
(scattered controls, no hierarchy) and RGB-gamer bloatware (neon gradients, glow
everywhere, animated chrome). Energy here is the steady glow of a well-lit
instrument, not a light show.

**Key Characteristics:**
- Neutral graphite depth (three tonal surface steps) with subtly lifted panels.
- A single accent — Heritage Jade — reserved for action, selection, focus, and live/healthy state.
- IBM Plex Sans throughout for UI; IBM Plex Mono for paths, versions, and logs.
- A fixed rem scale (no fluid display type) plus a glanceable 2xl step for stat readouts.
- Calm 150ms ease-out state transitions; motion conveys state, never decorates.
- Refined and restrained components: borders over fills, accent used sparingly.

## 2. Colors

A neutral graphite field carrying one mineral-green signal and two semantic alert hues.

### Primary
- **Heritage Jade** (`#3fc488`): The single accent. Primary action buttons, the
  active sidebar route, focus rings, in-progress/live state, healthy status. Its
  scarcity is the point — it should read as "the thing to look at." Verified
  7.0:1 on Panel and 8.0:1 on Graphite; accent *fills* always carry dark ink
  (Graphite) for ≥7:1 contrast, never white.
- **Jade Light** (`#66d3a2`): The lighter hover/active step of Heritage Jade.
  Hover on accent affordances and accent text-link hover only.

### Neutral
- **Graphite** (`#18181b`): The app canvas — the main content background.
- **Slate** (`#1e1e22`): Secondary background for nested or inset regions, and the
  fill behind inset input fields.
- **Pit** (`#121214`): The deepest surface — sidebar and input-field backgrounds.
- **Panel** (`#232328`): The lifted-card / panel / default-button surface.
- **Hover** (`#2e2e34`): Hover state for panels, buttons, and nav rows.
- **Seam** (`#34343c`): 1px borders and dividers between surfaces. Inputs use a
  lighter `#45454f` stroke, where the border is the only boundary cue.
- **Frost** (`#ececee`): Primary text. Headings, labels, body, values. ~13:1 on Panel.
- **Haze** (`#b8b8c0`): Secondary text. Captions, inactive nav, supporting copy. ~7.9:1.
- **Dim** (`#9b9ba3`): Muted text — the quietest readable tier (de-emphasized
  metadata, hints). Passes AA (≈5.7:1 on Panel). This is the floor — go no dimmer.

### Tertiary (semantic status)
- **Signal Green** (`#6fc79a`): Success — install complete, healthy state. A hair
  brighter than the accent; the two greens intentionally rhyme (see below).
- **Amber Alert** (`#e0a33e`): Warning — attention needed, recoverable.
- **Fault Red** (`#e5675f`): Error / danger — failures and destructive actions.

### Named Rules
**The One Signal Rule.** Heritage Jade appears on a small fraction of any screen and
means exactly one thing: *here is action or live state*. Never use it as
decoration, never tint large surfaces with it. If two jade things on a screen
aren't both actionable/live, one is wrong.

**The Green Signal family.** Because the accent is green, "go / action" and
"healthy / success" share the green channel by design — Heritage Jade for action,
Signal Green for positive state. They rhyme on purpose. The alert channel (Amber,
Fault Red) is a different hue family and carries every warning and error.

**The Status-Hue Rule.** Signal Green, Amber Alert, and Fault Red are reserved for
state. They never decorate. Each is always paired with an icon or text label — color
alone never carries meaning.

## 3. Typography

**Body & Display Font:** IBM Plex Sans (self-hosted via `@fontsource`, with
`-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` fallback)
**Mono Font:** IBM Plex Mono via `--font-mono` — the family's own monospace, for
paths, version strings, job ids, and log output only.

**Character:** One well-tuned technical humanist-grotesque (IBM Plex Sans) across
the whole tool — engineered, precise, instrument-like, with its mono sibling for
machine data so the type stays one voice. No display pairing, no fluid scale — a
product UI viewed at consistent DPI reads best on a fixed, tight rem ramp (ratio
≈1.12–1.14). Weight and size carry hierarchy, not font changes.

### Hierarchy
- **Stat** (700, 1.5rem / `--font-size-2xl`): Glanceable numbers on dashboard and
  Xenia cards. Reserved for at-a-glance readouts; never body or labels.
- **Title** (600, 1.25rem / `--font-size-xl`, line-height ~1.3): Page and major
  section headings.
- **Subtitle** (600, 1.125rem / `--font-size-lg`, line-height ~1.4): Card headers,
  panel titles.
- **Body** (400, 1rem / `--font-size-base`, line-height 1.5): Default prose and
  values. Cap prose at 65–75ch; dense data/tables may run wider.
- **Label** (500, 0.875rem / `--font-size-sm`): Buttons, nav links, form labels.
- **Caption** (500, 0.75rem / `--font-size-xs`): Metadata, small-button text,
  secondary hints.

### Named Rules
**The One Family Rule.** IBM Plex Sans does every UI job. No display face, no second
sans. Hierarchy is weight and size only. IBM Plex Mono is the single exception,
scoped to machine data (it's the same type family). A display font in a UI label is
forbidden.

## 4. Elevation

A hybrid system: depth is built primarily from **tonal graphite layering** — each
surface step (Pit → Graphite → Panel) sits visually higher than the one below,
reinforced by 1px Seam strokes. On top of that, primary panels and cards get a
**subtle ambient lift** so they read as floating above the canvas. Shadows are
quiet and ambient, never the hard drop-shadows of a 2014 app.

### Shadow / Ring Vocabulary (tokens)
- **`--shadow-card`** (`0 4px 16px rgba(0, 0, 0, 0.4)`): Ambient elevation under
  lifted cards and floating menus against the dark canvas.
- **`--ring-accent`** (`0 0 0 1px` jade @ 35%): The accent focus/selected indicator
  on interactive surfaces.

### Named Rules
**The Ambient-Only Rule.** Shadows are soft and diffuse against dark graphite — used
for gentle resting elevation and as a focus response. If a shadow looks like a hard
edge or a dark halo, it's too strong; soften it. Depth is mostly tone, not shadow.

## 5. Motion & Tokens

Motion is calm and state-driven. Shared tokens keep it consistent:
- **`--transition-fast`** (150ms) / **`--transition-base`** (200ms) with
  **`--ease-out`** (`cubic-bezier(0.22, 1, 0.36, 1)`) — natural deceleration, no
  bounce or elastic.
- Layout properties are never animated; the task progress bar scales on the
  compositor (`transform: scaleX`), not `width`.
- Every animation honors `prefers-reduced-motion` with a near-instant fallback.

A semantic **z-index scale** replaces arbitrary values: `--z-dropdown` (100) ·
`--z-sticky` (200) · `--z-modal-backdrop` (300) · `--z-modal` (400) · `--z-toast`
(500) · `--z-tooltip` (600).

## 6. Components

Refined and restrained: borders define structure, fills are reserved, the accent is
spent sparingly. Same vocabulary on every screen.

### Buttons
- **Shape:** Gently rounded (8px / `--radius-md`); small buttons keep the same
  radius at tighter padding.
- **Default:** Panel surface (`#232328`), Frost text, Seam stroke, padding
  `0.55rem 0.9rem`. The `--primary` variant tints the fill with ~18% Heritage Jade
  and the border with ~45% accent — a quiet emphasis, not a solid slab.
- **Accent (strong CTA):** Solid Heritage Jade fill with **dark Graphite ink**
  (never white — white fails contrast on the light-green accent). Hover → Jade Light.
- **Hover / Focus:** Border shifts to Heritage Jade, background to Hover, 150ms
  ease-out. Every actionable control shows a visible accent focus ring on keyboard
  focus. Disabled drops to 0.55 opacity, no transform.
- **Danger:** Fault Red text with an accent-of-red border; hover is a faint red
  tint + red text, never a solid red fill.

### Cards / Containers
- **Corner Style:** 12px (`--radius-lg`) — slightly softer than buttons.
- **Background:** Panel (`#232328`).
- **Shadow Strategy:** `--shadow-card` ambient lift (see Elevation).
- **Border:** 1px Seam; status cards swap to a full tinted border (success /
  warning / error) — never a side-stripe.
- **Internal Padding:** 20px (`--spacing-lg`).

### Inputs / Fields
- **Style:** Pit (`#121214`) fill, 1px input stroke (`#45454f`), 4px corners,
  Frost text, padding `0.375rem 0.5rem`.
- **Focus:** Border shifts to Heritage Jade, native outline removed. No glow beyond
  the border shift.
- **Disabled:** Reduced opacity, no border shift.

### Navigation (Sidebar)
- **Style:** Fixed 220px rail on Pit. Links are Haze text, 8px-rounded rows,
  label weight 500, 10px×12px padding.
- **Hover:** Background Hover, text lifts to Frost.
- **Active:** Background Hover, text becomes Heritage Jade — the route readout.
- **Mobile:** Desktop-first (Electron window); the rail persists rather than collapsing.

## 7. Do's and Don'ts

### Do:
- **Do** keep Heritage Jade (`#3fc488`) scarce — action, active route, focus, and
  live/healthy state only. Its rarity is the signal.
- **Do** build depth from the three graphite surface steps (Pit → Graphite →
  Panel) plus 1px Seam, then add a subtle ambient `--shadow-card` on top.
- **Do** put dark Graphite ink on any solid accent fill; white text fails contrast there.
- **Do** pair every status color with an icon or text label; never let
  Signal Green / Amber Alert / Fault Red carry meaning by hue alone.
- **Do** set body text in Frost (`#ececee`) or Haze (`#b8b8c0`); keep prose at
  65–75ch. Reach for the mono token only for machine data.
- **Do** keep transitions at `--transition-fast` with `--ease-out`, tied to state
  change, with a `prefers-reduced-motion` fallback.

### Don't:
- **Don't** push muted text below Dim (`#9b9ba3`, ≈5.7:1 on Panel). That's the
  readable floor — anything dimmer fails WCAG AA for body copy.
- **Don't** reintroduce navy or a cyan/blue accent — that's the category reflex
  this system deliberately left.
- **Don't** build the cramped "cheat engine" look: scattered controls, no
  hierarchy, controls stacked without rhythm.
- **Don't** ship RGB-gamer bloatware: neon gradients, glow everywhere, gradient
  text, or animated chrome competing with content. The accent stays muted.
- **Don't** introduce a second font or a display face for UI labels, buttons, or
  data — IBM Plex Sans does every job (Plex Mono excepted, for machine data only).
- **Don't** tint large surfaces with Heritage Jade or use it as decoration; two
  non-actionable jade things on one screen means one is wrong.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent
  stripe — use full borders, a background tint, or a leading icon instead.
