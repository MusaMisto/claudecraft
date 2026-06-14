# Contributing to Claudecraft

Thanks for helping improve Claudecraft. Focused bug fixes, performance work,
documentation, tests, accessibility improvements, and original game content
are welcome.

## Development Setup

Claudecraft requires Node.js `20.19+` or `22.12+` and npm.

```sh
git clone https://github.com/MusaMisto/claudecraft.git
cd claudecraft
npm install
npm run dev
```

Run `npm run build` before submitting a change. The build includes the strict
TypeScript check.

## Pull Request Guidelines

1. Open an issue before large architectural changes or broad content additions.
2. Keep each pull request focused on one coherent problem.
3. Describe the user-visible behavior and how it was verified.
4. Add or update a browser check when shared gameplay behavior changes.
5. Update `DECISIONS.md` when a change intentionally departs from the existing
   architecture, scope, or asset rules.
6. Do not include unrelated formatting, generated output, or refactors.

## Code Style

- Follow the existing strict TypeScript and module patterns.
- Prefer the repository's small focused classes over new framework layers.
- Keep fixed-tick gameplay logic deterministic where practical.
- Dispose Three.js, DOM, event-listener, and Web Audio resources during
  lifecycle teardown.
- Add comments only where an algorithm or constraint is not self-explanatory.

## Validation

Start the development server before running browser checks:

```sh
npm run dev
node scripts/browser-check.mjs
```

Choose checks that match the affected system. Common examples:

```sh
node scripts/phase4-check.mjs
node scripts/phase9-check.mjs
node scripts/passive-mobs-check.mjs
npm run check:structures
```

Extended soak scripts are appropriate for streaming, lifecycle, entity-cap, or
long-traversal changes.

## Assets and Licensing

- Do not submit copied Mojang code, textures, models, audio, fonts, or branding.
- New project assets must be original or have clear redistribution terms.
- Document every third-party asset in `CREDITS.md` and include its license when
  required.
- Respect the Faithful License and its non-monetization requirement for content
  containing Faithful textures.
- Keep the procedural texture and entity fallbacks working when optional
  Faithful files are absent.

## Reporting Bugs

Open a GitHub issue with:

- Reproduction steps.
- Expected and actual behavior.
- Browser, operating system, and relevant hardware details.
- Console output, screenshots, or a short recording when useful.
- Whether Vibrant Visuals or the Faithful 64x Pack was enabled.

Do not publish sensitive security details in a public issue.

## Suggesting Features

Describe the player problem, the proposed behavior, and how it fits the current
single-player creative scope. Survival systems, persistence, and multiplayer
are not implemented and should not be assumed to be committed roadmap items.
