# Handoff: Xenia Manager — Aurora Dashboard Redesign

## Overview
This is a full reskin of **Xenia Manager for Linux** in the style of the Xbox 360 **Aurora** dashboard: a glossy blue "light field" background, a horizontal coverflow of 3D game cases with reflections, a controller-button legend bar, and an immersive game-launcher feel. It covers the whole app shell (title bar, top nav, every screen) and wires the manager's real features (library, saves, Xenia builds, paths, launch options, patches & title updates) into that aesthetic.

It is controller- and keyboard-navigable, supports a **global Dark/Light theme**, and four library layouts (Blade carousel, Rail + carousel, Grid wall, Shelf/aisle).

## About the Design Files
The bundled file **`Xenia Aurora.dc.html`** is a **design reference**, not production code to ship. It is a self-contained HTML prototype (a single class component rendered with `React.createElement`) that demonstrates the intended look, layout, motion, and interactions.

Your task is to **recreate these designs inside the real Xenia Manager codebase** (React + Electron + TypeScript, Vite, feature-folder structure under `src/features/*`) using its existing patterns, stores, and IPC bridge — **not** to drop the HTML in. Replace the mock game array and mock handlers with the app's real data (library store, settings store, launch/patch/save clients). Keep the app's accessibility commitments from `PRODUCT.md` (WCAG AA, `prefers-reduced-motion`, no color-only state).

> Note: the existing app ships a "Graphite Cockpit" design system (`DESIGN.md`). This redesign is a deliberate, different visual direction (Aurora blue + glossy 3D). Treat the Aurora tokens below as the source of truth for these screens. The heritage **jade** accent (`#3fc488`) is intentionally retained so it still reads as Xenia.

## Fidelity
**High-fidelity.** Colors, typography, spacing, motion, and interactions are final. Recreate pixel-faithfully with the codebase's libraries. The 3D cases, perspective coverflow, reflections, and box-art wrap are core to the look — preserve them.

To preview the reference: open `Xenia Aurora.dc.html` in a browser. It persists view/theme prefs in `localStorage` under the key `xenia-aurora-prefs`.

---

## Global Shell

Fixed design canvas: **1280 × 800** (the app window). The reference scales fluidly to width; in the real Electron window it should fill and be responsive — the carousel centers itself via `left:50%` + a pixel `translateX`, so it is width-independent.

Z-order (low → high): background field (0) → screen content / carousel (2) → sidebar/nav (6–8) → title bar (10) → legend bar (8) → Details modal (30).

### Title bar — height 36px
- Left: a 18px jade ring glyph + **"Xenia Manager"** (13px / 600).
- Right: three 12px window dots (two neutral `--dot`, one red `rgba(229,103,95,0.85)`).
- Background `--titleBg`, 1px bottom border `--titleBorder`, `backdrop-filter: blur(8px)`.
- **No settings button here** (settings is a nav tab).

### Top nav (blade) — top:36, height 68px, padding 0 34px
- Items: **Home · Library · Xenia(removed) · Saves · Settings**. (Xenia was folded into Settings — see below. Final tabs: Home, Library, Saves, Settings.)
- Each item 18px; active = `--heading` color + 2px jade underline; inactive = `--faint`.
- Right side shows **"Show All ›"** (16px / 600) only on the Library screen.
- Background = `--navBg` (a soft top-down gradient).
- Shown on Home, Library (Blade mode), Saves, Settings. In Library **Rail** mode it is replaced by a left sidebar; in **Grid** mode by a grid top bar.

### Legend bar — bottom:0, height 58px, centered row
Controller + keyboard hints, **each button is clickable** and fires its action (hover = `--accentSoft` background, 8px radius, 5×8 padding).
- Glyph chip: pill, 2px colored border, colored letter (12px / 700). Colors: A `#6fc77f`, B `#e5675f`, X `#5aa8e6`, Y `#e6c34a`, LB/RB `--legendNeutral`.
- Label (14px / 600, `--legendLabel`) + a mono `kbd` chip (11px, `--legendKbd` on `--legendKbdBg`, 1px `--legendKbdBorder`, 4px radius).
- **Context-aware items:**
  - Game screens (Home, Library): `A Launch (Enter)` · `B Back (Esc)` · `X Browse (Space)` · `Y Details (I)` · `LB Prev Tab ([)` · `RB Next Tab (])`.
  - Non-game screens (Saves, Settings): only `B Back` · `X Browse` · `LB` · `RB` (no Launch/Details).

---

## Background field (all screens)
Built in `field()`. Layers, back to front:
1. Radial base gradient `radial-gradient(135% 105% at 50% 15%, hi 0%, mid 35%, deep 68%, deep2 100%)`.
2. A soft white horizon band (~`top:55%`, blurred 34px).
3. Three blurred "caustic" blobs (`blur(48px)`, radial color→transparent) that slowly drift via `@keyframes auroraDrift / auroraDrift2` (14–24s, ease-in-out) — disabled when **Ambient motion** is off or `prefers-reduced-motion`.
4. A radial vignette and a thin top sheen.

Palette depends on **theme** and the **Background tint** setting (dark only):
- Aurora Blue (default): hi `#3f8fd0`, mid `#1a4e8f`, deep `#0c2c5c`, deep2 `#06122b`; caustics `#34d0ff`, `#ff5cf0`, `#3df0c8`.
- Twilight Violet: hi `#7a4ad0`, mid `#3a1f7a`, deep `#1c0f44`, deep2 `#0e0826`; caustics `#b06cff`, `#ff6cc0`, `#6cd0ff`.
- Graphite Jade: hi `#2f5a48`, mid `#1b2a24`, deep `#0f1714`, deep2 `#08100c`; caustics `#3fc488`, `#67e8c0`, `#9be88a`.
- Light theme: hi `#f3f8fe`, mid `#d6e8f7`, deep `#bcd9f0`, deep2 `#d6e8f6`; caustics `#86cdf7`, `#c4a9f0`, `#8fe6cf`; reduced blob opacity, light vignette.

---

## Game case (the 3D box) — `makeCase()` and `coverArt()`
The signature element. A game cover is a real **3D case** with thickness, built with CSS 3D transforms.

- Base size: width `W`, height `H = round(W*1.4)`, depth `D = 13px`. `transform-style: preserve-3d`, `transform-origin: bottom center`.
- Wrapper transform: `perspective(1600px) translateZ(<0 or -34px>) rotateY(<angle>deg) scale(<1 or 1.5 selected>)`, transition `380ms cubic-bezier(0.22,1,0.36,1)`.
- Faces:
  - **Front**: `translateZ(D/2)`, 4px radius, the cover art. Selected gets ring `0 0 0 2px rgba(255,255,255,0.95), 0 12px 42px rgba(95,185,255,0.6)`; non-selected `brightness(0.9)` + ambient shadow.
  - **Spine (left)**: `rotateY(-90deg) translateZ(W/2)`, width D. Shows the wrap's spine region (or a gradient + vertical title).
  - **Right edge**: `rotateY(90deg) translateZ(W/2)`, light grey gradient (the case "pages"/opening).
  - **Top/bottom edges**: `rotateX(±90deg) translateZ(H/2)`, height D, subtle gradients.
- **Flat fallback** (`coverArt`, when 3D is off or for thumbnails/reflections): a single front-face div. The CSS-generated placeholder art = a `linear-gradient(150deg, c1, c2)` with a platform top strip, an Oswald uppercase title, an accent underline, and a genre label.

### Box-art wrap (Aurora-style) — `wrapFace()`
When a game has a `wrap` (a full Xbox 360 cover image laid out `[back | spine | front]`), the panels are mapped onto the case via background cropping:
- For a horizontal slice `[x0, x1]` (fractions of image width): `background-size: ${100/(x1-x0)}% 100%`, `background-position: ${x0/(1-(x1-x0))*100}% 50%`.
- Demo asset `assets/cover.png` (900×600, Gears of War 3, from xboxunity.net) uses: **front** `[0.524, 0.989]`, **spine** `[0.478, 0.522]`, **back** `[0.011, 0.476]`.
- The front region also feeds the flat `coverArt`, so grid tiles, reflections, and recents all show the real front. **In the real app, store each game's wrap image + the three fraction-ranges** (or a fixed standard layout) and this picks up everywhere automatically.

### Reflections
Each carousel item renders a mirrored copy of the **same** visual below it: `transform: scaleY(-1)`, `opacity: 0.3`, `mask-image: linear-gradient(to top, rgba(0,0,0,0.5), transparent 56%)`. In 3D mode it mirrors the angled 3D case (matching its `rotateY`/scale); in flat mode it mirrors the flat cover at matching scale. Toggled by **Reflections** setting.

---

## Screens / Views

### 1. Library (4 layouts, chosen in Settings → Library → Library View)
Bottom **info bar** (top:644, height 70) on all carousel layouts: centered Oswald title (30px) of the focused game + `"<n> OF <total>"` (13px, `--sub`).

- **Blade Carousel** (default, immersive): top nav + a horizontal reel. Slot width 158px, base case width 128px. The track is centered with `left:50%` + `translateX(-(sel*slot + slot/2))`. Focused case is scaled 1.5 and tilted `rotateY(-12deg)`; neighbors `rotateY(±52deg)` + `translateZ(-34px)` (coverflow). Click a non-focused case to center it; click the centered case again to open **Details**.
- **Rail + Carousel**: a 230px frosted **sidebar** (Games active, Xenia Builds, Saves, Profiles, Tasks, Settings; bottom status card "Xenia 1.0.0 · Healthy"). Carousel area starts at left:230, recenters automatically.
- **Grid Wall**: grid top bar ("Library", count, Search/Sort pills); 6-column grid of flat covers (122px), selected = white ring + scale 1.05; focused title strip above the legend.
- **Shelf** (Xbox aisle): gamer header (gamerpic, "Mattie", `G 5781 / 348`), a "Downloading 1 item" status, the focused game pulled out as a large 3D case, a perspective row of game **spines** receding (`rotateX(3deg) rotateY(-36deg)`), an avatar figure with upright cases on the right.

Selection index is shared between Blade/Shelf (`selBlade`); Rail and Grid have their own (`selRail`, `selGrid`).

### 2. Home
- Left glass card (flex 1.5): the featured/last-played game as a 3D case + **"CONTINUE PLAYING"** (jade eyebrow) + Oswald title (46px) + genre/index + **Launch** (jade) and **Details** (ghost) buttons.
- Right glass card (flex 1): **"Jump back in"** list of 4 recent games (44px cover + title + "Last played recently" + chevron); clicking jumps to Library focused on that game.

### 3. Saves
- Oswald header "Game Saves" + one glass card listing games: 38px cover, title, "Last save · N days ago", size (mono), **Export** (jade) / **Import** (ghost) per row.

### 4. Settings (seamless tab — glass panels on the field)
- Left **category rail** (glass, 230px): SETTINGS label + Profile · Library · Paths · Xenia · Launch · Appearance · About. Selected row = jade fill (`--accent`) with `--accentInk` text, 10px radius.
- Right **content panel** (glass): two columns, **remounted per category** (`key = cat`) to avoid stale reconciliation. Controls (Aurora style, themed):
  - **Radio**: 20px ring; selected row = jade fill + inner dot.
  - **Checkbox**: 20px square; checked = jade inner square.
  - **Text field**: 1px `--inputBorder`, `--inputBg`, 6px radius.
  - Buttons: **jade** (primary) / **ghost** (secondary).
- Categories (map to the real `src/features` data):
  - **Profile**: Gamer Tag (`gamer_tag`), Profile Picture (avatar + Change), Xbox Live (Enabled checkbox, Username, API Key + Request + masked key).
  - **Library**: Library View (Blade/Rail/Grid/Shelf → `viewMode`), Click Behavior (Single/Double → `click_behavior`).
  - **Paths**: the three `PATH_FIELDS` (Xenia Emulator, Application Data, Library Metadata) as rows with mono values + Edit, plus **Edit Paths**.
  - **Xenia** (folded-in former tab): Release Channel (Canary/Edge → `channel`), Installed Builds list (name, version mono, ACTIVE badge, Update/Set Active), Maintenance (status + Check for Updates / Reinstall / Clear Cache / Open Install Folder).
  - **Launch**: Launch Environment (textarea, mono) + presets (MangoHud/GameMode/gamescope), Launch Wrapper (`launch_wrapper`) + presets — maps to `launch_environment` / `launch_wrapper`.
  - **Appearance**: Theme (Dark/Light → global `theme`), Background tint (Aurora Blue/Twilight Violet/Graphite Jade → `fieldTint`), Effects (3D cover art / Reflections / Ambient motion).
  - **About**: app name, version, blurb, links.

### 5. Details modal (the "Y" window) — z-index 30, dim scrim + blur
Opens for the focused game (Y / `i`, gamepad Y, Home's Details button, or re-clicking the centered cover). A centered themed panel (`--modalBg`):
- **Header**: 3D case (tilted) + Oswald title (38px) + `"<genre> · Title ID <id>"` + **Launch** (jade) / **Manage Profiles** (ghost) + ✕ close.
- **Patches** column: `<game>.patch.toml` label, a list of patch entries (name + description + **jade toggle switch**), and **Import Patch File** / **Download Patches**. (Maps to the app's per-game `.patch.toml` entries; toggle = enable/disable patch entry.)
- **Updates & DLC** column: **Title Updates** (current "Title Update 5", content type `000B0000`, INSTALLED, Import Title Update) and **Downloadable Content** (DLC rows with size + Installed/Import, Import DLC).
- Close on ✕, scrim click, **B**, or **Esc**.

---

## Interactions & Behavior
- **Carousel centering**: width-independent via `left:50%` + pixel `translateX`; transition `380ms cubic-bezier(0.22,1,0.36,1)`.
- **Coverflow angles**: focused `-12deg`/scale 1.5; left neighbors `+52deg`, right `-52deg`, pushed back `translateZ(-34px)`.
- **Keyboard**: `←/→` move selection (`↑/↓` in Grid; `↑/↓` change category in Settings); `[`/`]` switch tabs; `i` open Details; `Esc` close Details / go Home; `B` close Details.
- **Gamepad** (`navigator.getGamepads`, polled via `requestAnimationFrame`, edge-detected): D-pad = move/grid; LB(4)/RB(5) = prev/next tab; Y(3) = Details; Start(9) = Settings; B(1) = close Details / Home.
- **Legend buttons**: clickable, same actions; hidden game actions on non-game screens; `openDetails()` is guarded to only fire on Library/Home.
- **Motion** honors `prefers-reduced-motion` (caustic drift + transitions fall back).

## State Management
Single component state (persist the starred keys to disk via the settings store / `localStorage` key `xenia-aurora-prefs`):
- `screen`: 'home' | 'library' | 'saves' | 'settings'
- `viewMode`*: 'blade' | 'rail' | 'grid' | 'shelf'
- `selBlade` / `selRail` / `selGrid`: focused index per layout
- `theme`* : 'dark' | 'light' (global)
- `fieldTint`*: background palette
- `cover3D`* / `reflections`* / `ambientMotion`*: effect toggles
- `clickBehavior`* ('single'|'double'), `channel`* ('canary'|'edge')
- `settingsCat`: active settings category
- `detailsGame`: index of game shown in Details (or null)
- `patchToggles`: map of patch-entry id → enabled
In the real app, back these with the existing **settings store** (`AppSettings`: `gamer_tag`, `click_behavior`, `launch_environment`, `launch_wrapper`, paths…) and **library/patch/save clients**; persist UI prefs (view, theme, effects) alongside settings.

## Design Tokens

### Theme tokens (`ui()`), Dark / Light
| token | Dark | Light |
|---|---|---|
| accent | `#3fc488` | `#1f9d68` |
| accentInk (text on accent) | `#06241a` | `#ffffff` |
| accentSoft / border | `rgba(63,196,136,0.16)` / `…0.32` | `rgba(31,157,104,0.16)` / `…0.34` |
| heading | `#ffffff` | `#10202e` |
| text | `#eaf2fb` | `#1d2733` |
| sub | `#9fb0c2` | `#52606e` |
| faint | `rgba(214,228,244,0.5)` | `rgba(25,45,65,0.45)` |
| groupTitle | `#8aa0b6` | `#71808f` |
| glassBg / border | `rgba(8,20,40,0.5)` / `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.62)` / `rgba(20,45,75,0.12)` |
| glassShadow | `0 8px 30px rgba(0,0,0,0.35)` | `0 10px 30px rgba(30,60,100,0.16)` |
| modalBg | `rgba(10,22,42,0.97)` | `rgba(248,251,254,0.98)` |
| inputBg / border | `#0d131b` / `#2a3744` | `#ffffff` / `#c2c6cd` |
| sep / rowBorder | `rgba(255,255,255,0.1)` | `rgba(20,45,75,0.12)` |
| switchOff | `rgba(255,255,255,0.18)` | `#d3d9e0` |
| titleBg / border / text | `rgba(6,16,36,0.82)` / `…0.07` / `#dbe8f5` | `rgba(244,249,253,0.88)` / `…0.1` / `#1d2733` |
| ghostBorder | `rgba(255,255,255,0.28)` | `rgba(25,50,80,0.22)` |

Status hues (both themes): success `#6fc79a`, warning `#e0a33e`, error `#e5675f`.

### Typography
- **UI**: `Titillium Web` (300/400/600/700) — nav, body, labels, settings.
- **Display**: `Oswald` (600/700) — game titles, big headings, gamerscore, spine/cover titles (uppercase).
- **Mono**: `ui-monospace, monospace` — paths, title IDs, versions, kbd chips.
- Scale (px): hero title 46 · page/section 30 · panel title 22–26 · group title 24–25 (300 wt) · body 17–19 · label 14–16 · caption/kbd 11–13.

### Spacing & shape
- Radii: small 4–6px (covers, inputs), 8–10px (buttons, rows), 12–14px (cards/panels/modal), pills 13–20px.
- Card padding 24–40px; content gutters 30–44px; standard gap 10–24px.
- Case depth `D = 13px`; cover aspect `H = W*1.4`.

### Motion
- Easing `cubic-bezier(0.22,1,0.36,1)`; durations: selection/scroll 380ms, scale 320ms, hover 120ms, switch 150ms.
- Caustic drift 14–24s ease-in-out infinite.

## Assets
- `assets/cover.png` — full Xbox 360 box-art wrap for Gears of War 3 (900×600, source: xboxunity.net). Demo only; supply per-game wraps in production. Avoid shipping copyrighted Xbox/game logos unless licensed — use the user's own library scans.
- Fonts: **Titillium Web** + **Oswald** (Google Fonts in the prototype; self-host in the app, alongside the existing IBM Plex if both are kept).
- Placeholder covers for the other 11 games are CSS-generated (gradient + title); replace with real library artwork.

## Files
- `Xenia Aurora.dc.html` — the full interactive reference (one component; all screens, views, Details modal, settings, theming, controller/keyboard nav, 3D cases, wrap, reflections).
- `assets/cover.png` — the box-art wrap used by the demo.

Read the component top-to-bottom: `ui()`/`tintPalette()`/`field()` (theming + background), `coverArt()`/`wrapFace()`/`makeCase()` (cases + wrap), `carousel()`/`grid()`/`shelfView()` (library layouts), `home()`/`saves()`/`settingsScreen()`+`cat*()` (screens), `renderDetails()` (Details), `legend()`/`bladeNav()`/`sidebar()`/`titlebar()` (chrome), `handleKey()`/`pollGamepad()` (input).
