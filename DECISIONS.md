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
