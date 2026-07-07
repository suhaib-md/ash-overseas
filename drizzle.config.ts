import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` diffs the schema and writes SQL migrations to ./migrations.
// It does NOT need a live DB connection. Migrations are applied to D1 with
// `wrangler d1 migrations apply` (see package.json scripts + SETUP.md).
//
// `pnpm db:studio` (optional) connects to remote D1 over the HTTP API and needs
// CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_DATABASE_ID / CLOUDFLARE_D1_TOKEN in .dev.vars.
export default defineConfig({
  dialect: 'sqlite',
  schema: './worker/db/schema.ts',
  out: './migrations',
});
