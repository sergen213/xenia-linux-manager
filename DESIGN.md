---
name: Xenia Linux Manager
description: A luminous glass HUD over a living aurora field — the Xbox 360 dashboard, reimagined for managing Xenia on Linux
colors:
  aurora-blue: "#3fa6e8"
  aurora-blue-hover: "#66bcef"
  accent-ink: "#042234"
  accent-soft: "#3fa6e829"
  heading: "#ffffff"
  text: "#eaf2fb"
  sub: "#9fb0c2"
  faint: "#d6e4f4"
  group-title: "#8aa0b6"
  glass: "#0814289e"
  modal: "#0a162af7"
  input-bg: "#0d131b"
  input-border: "#2a3744"
  glass-border: "#ffffff1a"
  field-hi: "#3f8fd0"
  field-mid: "#1a4e8f"
  field-deep: "#0c2c5c"
  field-deep2: "#06122b"
  field-c1: "#34d0ff"
  field-c2: "#ff5cf0"
  field-c3: "#3df0c8"
  success: "#6fc79a"
  warning: "#e0a33e"
  error: "#e5675f"
typography:
  cover:
    fontFamily: "Oswald, Titillium Web, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: "normal"
  display:
    fontFamily: "Oswald, Titillium Web, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.02em"
  body:
    fontFamily: "Titillium Web, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Titillium Web, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  caption:
    fontFamily: "Titillium Web, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "14px"
components:
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.9rem"
  button-ghost-hover:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
  button-primary:
    backgroundColor: "{colors.aurora-blue}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.9rem"
  button-primary-hover:
    backgroundColor: "{colors.aurora-blue-hover}"
    textColor: "{colors.accent-ink}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.error}"
    rounded: "{rounded.md}"
  button-small:
    rounded: "{rounded.md}"
    padding: "0.38rem 0.7rem"
  card:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "{colors.input-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.5rem"
  modal-panel:
    backgroundColor: "{colors.modal}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
---

# Design System: Xenia Linux Manager

## 1. Overview

**Creative North Star: "The Aurora Dashboard"**

This is the Xbox 360 "Aurora" dashboard reborn as a desktop tool: a luminous,
glossy glass HUD floating over a slow, living aurora field. The user reads it the
way they'd read a console home screen — at a glance, the content lit from behind
by a deep blue (or violet, or jade) sky. Surfaces are **translucent glass** that
lets the field glow through; the field itself is one calm, slow drift, never a
light show. The single live signal is **Aurora Blue** (`#3fa6e8`) — the color of
action, the current selection, focus, and healthy/live state. Everything else is
either glass, text, or atmosphere.

This system deliberately replaced the earlier flat "Graphite Cockpit" (opaque
navy panels, a static heritage-green accent). The Aurora reskin trades opaque
chrome for depth-through-translucency and gives the user a themeable sky (Aurora
Blue by default, with Violet and Jade tints, plus a full Light mode). The accent
is no longer one fixed color — it is whatever the chosen tint makes it, and
*every* selection glow, focus ring, and primary fill derives from that one token.

It serves a mixed audience that leans novice, so legibility and honest state beat
flourish. It explicitly rejects the two failure modes named in PRODUCT.md: the
cramped "cheat engine" mod-tool (scattered controls, no hierarchy) and RGB-gamer
bloatware (neon gradients, glow everywhere, animated chrome competing with
content). Aurora uses color and glass, but as *one* calm backdrop and *one* scarce
signal — the energy of a well-lit console home screen, not a gaming rig's LEDs.

**Key Characteristics:**
- Translucent glass surfaces (`backdrop-filter` blur) layered over a living aurora field — depth comes from translucency + blur, not opaque panels.
- A single themeable accent — Aurora Blue by default, retinted per Background (Violet / Jade) and per theme (Light) — reserved for action, selection, focus, and live state.
- **Oswald** for display/cover titles, **Titillium Web** for all UI text, **IBM Plex Mono** for machine data — a console-grade type voice.
- One slow, transform-only field drift; calm 150ms ease-out state transitions. Motion conveys state and atmosphere, never decorates.
- WCAG AA contrast floors enforced against the bright field: solid-on-glass text, dark ink on accent fills, readable muted tiers.

## 2. Colors

A deep, lit sky carrying one themeable signal, three semantic alert hues, and a translucent neutral glass scale.

### Primary
- **Aurora Blue** (`#3fa6e8`): The single accent (default theme). Primary action
  buttons, the active route, focus rings, selection glow, in-progress/live and
  healthy state. Its scarcity is the point. **Themeable**: the Background control
  retints it (Violet `#a06cf0`, Jade `#3fc488`), and Light mode deepens it to
  `#1c74b8` so white button ink clears 4.5:1. Everything accent-colored derives
  from this one token — never hard-code a second blue.
- **Aurora Blue (hover)** (`#66bcef`): The lighter hover step for accent fills and accent text-link hover.
- **Accent Ink** (`#042234`): The dark ink placed on *solid* accent fills (buttons, the OSK done-key). White on the accent fails contrast; dark ink clears it. Light mode is the one exception — its deepened accent takes white ink.

### Tertiary (semantic status)
- **Signal Green** (`#6fc79a`): Success — install complete, healthy state.
- **Amber Alert** (`#e0a33e`): Warning — attention needed, recoverable.
- **Fault Red** (`#e5675f`): Error / danger — failures and destructive actions.

### Neutral
- **Heading** (`#ffffff`): Page, section, and game titles.
- **Text** (`#eaf2fb`): Primary body text and values on glass.
- **Sub** (`#9fb0c2`): Secondary text — captions, supporting copy, inactive rail.
- **Faint** (`rgba(214, 228, 244, 0.72)`): The quietest readable tier — inactive blade-nav tabs, first-run hints. This is the floor; go no fainter (the old `0.5` alpha washed out over the field).
- **Group Title** (`#8aa0b6`): Settings section eyebrows.
- **Glass** (`rgba(8, 20, 40, 0.62)`): The translucent surface of cards, panels, sidebars, and bars. Opaque enough to hold a text-contrast floor over the bright field, translucent enough to read as glass.
- **Modal** (`rgba(10, 22, 42, 0.97)`): The near-opaque dialog panel — readable regardless of what's behind it.
- **Input** (`#0d131b` fill, `#2a3744` stroke): Inset field surfaces.
- **Glass Border** (`rgba(255, 255, 255, 0.1)`): The 1px top-lit edge that separates glass from field.

### Atmosphere (the Aurora field)
The animated background gradient. Never holds text directly; it is the light source the glass floats on.
- **Field ramp** (`#3f8fd0` → `#1a4e8f` → `#0c2c5c` → `#06122b`): The radial sky, bright at top, deep at the horizon.
- **Field blobs** (`#34d0ff`, `#ff5cf0`, `#3df0c8`): Three slow-drifting, heavily-blurred color clouds — the aurora itself. Retinted per Background.

### Named Rules
**The One Signal Rule.** The accent appears on a small fraction of any screen and means exactly one thing: *here is action or live state*. Never tint large surfaces with it; never use it as decoration. Two non-actionable accent things on one screen means one is wrong.

**The Themed Accent Rule.** There is no second hard-coded accent color. The active accent is `--au-accent`, set by theme + Background tint. Selection glows, focus rings, soft tints, and primary fills all derive from it (via `color-mix` or the `--au-accent-*` tokens) so a tint change recolors the whole signal at once.

**The Field-Is-Light Rule.** The aurora field is the light source, not content. It carries no text, sits behind everything at `z-index: 0`, and drifts on one slow loop. If it ever competes with content for attention, it's too bright — lower the blob opacity, not the content.

## 3. Typography

**Display Font:** Oswald (condensed grotesque) — cover and section titles only.
**Body Font:** Titillium Web (with `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui` fallback) — every UI string.
**Mono Font:** IBM Plex Mono — paths, version strings, job ids, log output only.

**Character:** A console type voice. Oswald's tall condensed caps give game and
section titles the weight of a dashboard masthead; Titillium Web — humanist,
slightly technical — carries the dense UI underneath without shouting. The pairing
contrasts on a real axis (condensed display vs. humanist sans), never two lookalike
sans. Plex Mono is the machine-data exception.

### Hierarchy
- **Cover** (Oswald 700, 3rem / `--font-size-cover`, line-height 1.0): Game-case cover-art titles in the coverflow. Uppercase, tight.
- **Display** (Oswald 600, 1.625–2.375rem, line-height ~1.1): Game-detail titles, the info-bar readout, page mastheads. Long names wrap (`break-word`) in the modal header and truncate (`ellipsis`) in the single-line info bar.
- **Body** (Titillium Web 400, 1rem / `--font-size-base`, line-height 1.5): Default prose and values. Cap prose at 65–75ch.
- **Label** (Titillium Web 600, 0.875rem / `--font-size-sm`): Buttons, nav tabs, form labels.
- **Caption** (Titillium Web 500, 0.75rem / `--font-size-xs`): Metadata, small-button text, hints.
- **Mono** (IBM Plex Mono, 0.875rem): Paths, versions, job ids, logs.

### Named Rules
**The Two-Face Rule.** Oswald does display (cover + section/game titles); Titillium Web does everything else; IBM Plex Mono does machine data. No third family, and no display face in a label, button, or value. Only weights 300/400/600/700 of Titillium are loaded — a requested "medium" maps to 600, never an unloaded 500.

## 4. Elevation

A **glass-over-light** hybrid. Depth is built from translucency and blur, not
opaque tonal steps: each surface is semi-transparent glass with a `backdrop-filter`
blur, a 1px top-lit border, and a single ambient shadow, all floating above the
luminous aurora field. There is no hard drop-shadow vocabulary — the field showing
through *is* the depth cue.

### Shadow / Ring Vocabulary (tokens)
- **`--au-glass-shadow` / `--shadow-card`** (`0 8px 30px rgba(0, 0, 0, 0.35)`): The ambient lift under glass cards, bars, and floating menus.
- **`--ring-accent`** (`0 0 0 1px` accent @ 35%): The selected/focus indicator on interactive surfaces.
- **Selection glow** (`0 …px …px color-mix(in srgb, var(--au-accent) 50–65%, transparent)`): The colored halo under a selected game case — derived from the accent, so it follows the tint.

### Named Rules
**The Float-On-Glass Rule.** Surfaces float on translucent glass over the field — never opaque slabs. If a panel reads as a solid box with a hard shadow, it's wrong: raise its translucency, soften the shadow, let the field glow through. The blur is the material; the shadow is only a whisper of lift.

## 5. Components

Refined and console-grade: glass defines structure, the accent is spent sparingly, the same vocabulary repeats on every screen.

### Buttons
- **Shape:** Gently rounded (8px / `--radius-md`); small buttons keep the radius at tighter padding (`0.38rem 0.7rem`).
- **Ghost (default):** Transparent fill, Text color, 1px ghost border, padding `0.55rem 0.9rem`. Hover lifts the border to accent + a faint accent-soft wash.
- **Primary (strong CTA):** Solid Aurora Blue fill with **dark Accent Ink** (white fails contrast on the accent; Light mode's deepened accent is the lone white-ink exception). Hover → Aurora Blue (hover).
- **Danger:** Fault Red text with a red-tinted border; hover is a faint red wash, never a solid red fill.
- **Focus:** Every actionable control shows a 2px accent focus ring on `:focus-visible` (and while controller-steering). Disabled drops to 0.55 opacity, no transform.

### Cards / Glass Panels
- **Corner Style:** 14px (`--radius-lg`) — softer than buttons.
- **Background:** Glass (`rgba(8, 20, 40, 0.62)`) with `backdrop-filter` blur.
- **Border:** 1px glass border (`rgba(255,255,255,0.1)`); status cards swap to a full tinted border — never a side-stripe.
- **Shadow Strategy:** `--shadow-card` ambient lift (see Elevation).

### Inputs / Fields
- **Style:** Input fill (`#0d131b`), 1px input stroke (`#2a3744`), 6px corners, Text color, padding `0.375rem 0.5rem`.
- **Focus:** Border shifts to accent; the search field adds a 2px accent ring. Every input carries an accessible name (visible label or `aria-label`).
- **Disabled:** Reduced opacity, no border shift.

### Navigation (Blade)
- **Style:** A top "blade" bar of text tabs; the bar is the window drag handle.
- **States:** Inactive = Faint; hover = Text; active = Heading weight 700 with a 2px accent underline — the route readout.

### Selection Controls (Radio / Check)
- **Style:** Full-width pill rows. A radio reads `role="radio"` inside a named `role="radiogroup"`; the selected pill fills with the accent + Accent Ink.

### Dialogs (Modal)
- **Style:** Near-opaque Modal panel (`rgba(10,22,42,0.97)`), 14px radius, blurred backdrop scrim. Hardened: `role="dialog"`, accessible name, Escape closes, focus trapped inside and restored to the opener on close.

### Custom Select (Signature)
- A keyboard- and controller-navigable `listbox`. The menu **portals to `<body>`** with `position: fixed` anchored to the trigger, so it escapes overflow/`backdrop-filter` clipping (e.g. inside a scrolling modal) and stacks above dialogs.

### The Aurora Field + Coverflow (Signature)
- The animated field (`AuroraField`) is the app's backdrop on every authenticated screen. Its blobs drift on a **transform-only** keyframe with a static blur — pre-rasterized once, moved on the GPU.
- The library coverflow renders 3D game cases with a white ring + accent selection glow; off-window cases are culled for performance, and the grid wall memoizes each cell so moving the selection re-renders only the two affected cells.

## 6. Do's and Don'ts

### Do:
- **Do** keep the accent scarce — action, active route, focus, selection, and live/healthy state only. Its rarity is the signal.
- **Do** derive every accent-colored thing from `--au-accent` (or `color-mix` of it) so Background tints and Light mode recolor the whole signal at once.
- **Do** put dark Accent Ink on any solid accent fill; white text fails contrast there (Light mode's deepened accent is the one white-ink exception).
- **Do** build depth from translucent glass + `backdrop-filter` blur + a 1px top-lit border over the field, then a quiet ambient `--shadow-card`.
- **Do** keep glass opaque enough to hold a text-contrast floor over the bright field (dark `0.62`, light `0.74`), and keep muted text at or above the Faint floor (`0.72` alpha).
- **Do** set Oswald for cover/section titles, Titillium Web for all UI text, IBM Plex Mono for paths/versions/logs only.
- **Do** keep transitions at `--transition-fast` (150ms) with `--ease-out`, tied to state, with a `prefers-reduced-motion` fallback. Animate transform/opacity, never `filter`/layout per frame.

### Don't:
- **Don't** build the cramped "cheat engine" look: scattered controls, no hierarchy, controls stacked without rhythm.
- **Don't** ship RGB-gamer bloatware: neon gradients on content, glow everywhere, gradient text, or animated chrome competing with content. The field is one calm drift; the accent stays a single signal.
- **Don't** over-decorate buttons or invent affordances for standard tasks — earned familiarity beats novelty.
- **Don't** hard-code a second accent/selection color (e.g. a literal `#5fb9ff` glow). Use the accent token, or it will clash on Violet/Jade/Light.
- **Don't** let the aurora field carry text or out-shout content; it sits at `z-index: 0` and is the light source, not the subject.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe — use a full border, a background tint, or a leading glyph.
- **Don't** introduce a display face into UI labels, buttons, or values, or request an unloaded font weight (medium maps to 600).
