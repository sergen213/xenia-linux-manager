# Product

## Register

product

## Users

Mixed-skill desktop users on Linux who want to play Xbox 360 games through the
Xenia emulator without living in a terminal. The base leans toward less-technical
users: they want a one-click, "it just works" path to a running game. Power users
exist at the edges (patches, per-game profiles, release channels, archive
management), but the default experience must serve the novice first. Primary job
on most screens: get a game running fast, with minimal configuration, and trust
that the manager handled the messy parts (Xenia install/update, library, saves,
profiles).

## Product Purpose

A native desktop manager (Tauri + React) that owns the full Xenia lifecycle on
Linux: install and update the emulator across release channels, organize the game
library and save data, and apply per-game profiles and patches. It exists to
collapse a fragile, terminal-heavy workflow into a calm, guided GUI. Success looks
like: a new user reaches a playable game without reading docs, and an experienced
user can tune any build or game without fighting the interface.

## Brand Personality

Precise, calm, capable. Quiet competence over flash. The tool should disappear
into the task — clear state, honest feedback, no drama. Voice is plain and
reassuring: tell the user what's happening and what to do next, never hype.
Confidence comes from reliability and clarity, not decoration.

## Anti-references

- Cluttered "cheat engine" / mod-tool aesthetics: cramped panels, scattered
  controls, no hierarchy.
- RGB-gamer bloatware: neon gradients, glow everywhere, animated chrome competing
  with content.
- Over-decorated buttons, gratuitous motion, invented affordances for standard
  tasks. Earned familiarity beats novelty here.

## Design Principles

- **The tool disappears into the task.** Every screen optimizes for the user's
  current job; chrome recedes, state is obvious.
- **Novice-first, power-user-deep.** The happy path is one-click and guided;
  advanced controls are reachable but never block or clutter the default flow.
- **Honest state, always.** Loading, success, error, empty — show real status with
  plain feedback. Never leave the user guessing what the manager is doing.
- **Calm over loud.** Restraint in color and motion. The accent marks action and
  state, not decoration.
- **Consistency is a feature.** Same button, same form control, same icon style
  screen to screen. Familiarity earns trust.

## Accessibility & Inclusion

- Target WCAG AA: body text ≥4.5:1 against its background, large text ≥3:1.
  Audit the existing dark palette (navy surfaces, muted slate text) against this
  floor and fix near-misses toward the ink end of the ramp.
- Honor `prefers-reduced-motion`: every transition needs a crossfade or instant
  fallback.
- Don't rely on color alone for state (success/warning/error pair with icon or
  text).
