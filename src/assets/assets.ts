// Project-local image assets resolved through Vite. `new URL(..., import.meta.url)`
// makes Vite copy + hash the file into the production build and serve it from the
// project root in dev. The logo always exists; the default skin is user-supplied
// (docs/skin.png) and may be absent — Vite leaves an unresolved runtime URL in
// that case (build does not fail), and the loader falls back to a generated skin.
export const logoUrl = new URL('../../docs/claudecraft-logo.png', import.meta.url).href;
export const defaultSkinUrl = new URL('../../docs/skin.png', import.meta.url).href;
export const faviconUrl = new URL('../../docs/favicon.png', import.meta.url).href;
