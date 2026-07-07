import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

// The Cloudflare plugin reads wrangler.jsonc, runs the Worker in workerd during
// `vite dev`, and builds both the SPA (dist/client) and the Worker on `vite build`.
// Tailwind v4 scans the module graph automatically (no content config needed).
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
});
