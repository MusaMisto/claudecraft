# Claudecraft — Decisions & Deviations

## 2026-06-12 — `EventBus.ts` exists but is unused

The Section 6 layout includes a tiny event bus. In practice plain callback
properties (`onPauseRequested`, `onClose`, …) covered every cross-module
signal, so nothing was routed through the bus. The module is kept because the
spec's file layout lists it, but no code depends on it.

## 2026-06-12 — `window`-exposed debug hooks kept after Phase 10 cleanup

`Game.debugHooks()` and `window.app` expose the running session to the
headless acceptance scripts in `scripts/`. They are required to re-run the
phase verifications, cost nothing at runtime, and are documented here instead
of being removed with the temporary debug scenes.

## 2026-06-12 — Colon in repository path breaks npm/Vite defaults

The repo lives under `…/Side:Fun Projects/claudecraft`. The `:` is the PATH
delimiter, so npm cannot prepend `node_modules/.bin` to PATH for run-scripts,
and Vite's `server.fs` allow-list path matching rejects the project root.

**Workarounds (no behavior change for a fresh clone in a normal path):**
- `package.json` scripts call binaries by explicit path (`./node_modules/.bin/vite`).
- `vite.config.ts` sets `server.fs.strict = false` (dev server only).

## 2026-06-12 — Added `src/Game.ts` to the Section 6 layout

`main.ts` is the menu → game lifecycle bootstrap per the spec; the running
world session itself (scene, player, HUD, audio hooks, dispose) lives in a
dedicated `Game.ts` class so `main.ts` stays small and a session can be torn
down cleanly on "Quit to Title". This is an addition to the file layout, not
a behavioral deviation.

## 2026-06-12 — Dev-only dependency: `puppeteer-core`

Added `puppeteer-core` as a devDependency, plus `scripts/browser-check.mjs`,
to satisfy the workflow rule that each phase's acceptance criteria be verified
by running the game in a real browser. It drives the locally installed Brave
(Chromium) headlessly to capture console errors, FPS, and screenshots. It is
not part of the game build and ships no assets.

## 2026-06-13 — Water physics uses the classic (pre-1.13) Minecraft model

Phase 12's "behave exactly as in Minecraft" water request is implemented with
the classic per-tick fluid model (drag ×0.8, gravity 0.02, jump impulse 0.04,
climb-out boost 0.3), as documented for beta-era Java Edition. Modern 1.13+
"sprint-swimming" (horizontal swim pose, fluid push vectors) is out of scope;
the classic model matches this game's era and delivers the requested
sink / bob / float / swim behavior with exact emergent speeds.

## 2026-06-13 — First-person arm is visible while holding a block

Vanilla Minecraft hides the arm when a block occupies the hand (the block
alone is drawn). The user explicitly asked for the arm to be visible with the
item on it, so Claudecraft draws a code-generated boxy right arm beneath the
0.4-scale block. The block's scale/pose matches the vanilla
`firstperson_righthand` transform; the visible arm is a deliberate deviation.
