import { Hono } from 'hono';

export interface Env {
  /** D1 database binding (see wrangler.jsonc). */
  DB: D1Database;
  // BACKUPS: R2Bucket — added in Phase 3 alongside the R2 bucket.
}

const app = new Hono<{ Bindings: Env }>();

// Only /api/* reaches the Worker (run_worker_first in wrangler.jsonc). Everything
// else is served as static SPA assets by the platform.
app.get('/api/health', (c) =>
  c.json({ ok: true, service: 'ash-overseas-ledger', time: new Date().toISOString() }),
);

// Explicit JSON 404 for unmatched API routes (SPA fallback handles non-API paths).
app.notFound((c) => c.json({ ok: false, error: 'not_found' }, 404));

export default app;
