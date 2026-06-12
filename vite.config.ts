import { defineConfig } from 'vite';

// The project lives under a directory containing ":" (Side:Fun Projects),
// which breaks Vite's fs allow-list path matching. See DECISIONS.md.
export default defineConfig({
  server: {
    fs: { strict: false },
  },
});
