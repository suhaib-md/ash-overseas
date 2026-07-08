# ASH Overseas — Setup & Cloudflare Runbook

Everything a developer/maintainer needs to run the app locally and provision it on
Cloudflare. Business rules live in `SRS.md`; the build plan lives in `CLAUDE.md`.

---

## 0. Prerequisites (one-time, on your machine)

| Tool                 | Required                    | Check            |
| -------------------- | --------------------------- | ---------------- |
| **Node.js**          | **≥ 22.15 LTS** (or 24 LTS) | `node --version` |
| pnpm                 | ≥ 10                        | `pnpm --version` |
| Git                  | any recent                  | `git --version`  |
| A Cloudflare account | free plan is fine           | —                |

> ⚠️ **Node must be ≥ 22.15.** The Cloudflare Vite plugin uses `module.registerHooks`,
> which was added in Node 22.15. On older 22.x, `pnpm dev` / `pnpm build` fail with
> _"node:module does not provide an export named 'registerHooks'"_.
>
> **Upgrade on Windows** (pick one):
>
> - `winget install OpenJS.NodeJS.LTS` (then reopen the terminal), **or**
> - download the LTS installer from <https://nodejs.org>, **or**
> - if you use nvm-windows: `nvm install lts` then `nvm use lts`.
>   Re-check with `node --version` (want ≥ 22.15), then `pnpm install`.

Install dependencies:

```sh
pnpm install
```

Local-only checks that need no cloud account:

```sh
pnpm test        # money/ledger unit tests
pnpm typecheck   # all TS projects
```

---

## 1. Log in to Cloudflare (one-time)

```sh
npx wrangler login
```

This opens a browser to authorize Wrangler. Confirm with:

```sh
npx wrangler whoami
```

---

## 2. Create the databases (D1)

You need **two** databases — a dev one and a prod one — so real figures never mix
with test data.

```sh
npx wrangler d1 create ash-overseas-dev
npx wrangler d1 create ash-overseas-prod
```

Each command prints a block like:

```
[[d1_databases]]
binding = "DB"
database_name = "ash-overseas-dev"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   <-- copy this
```

Open **`wrangler.jsonc`** and paste the ids:

- put the **dev** id in the top-level `d1_databases[0].database_id`
  (replaces `REPLACE_WITH_DEV_DATABASE_ID`);
- put the **prod** id in `env.production.d1_databases[0].database_id`
  (replaces `REPLACE_WITH_PROD_DATABASE_ID`).

---

## 3. Create the backup bucket (R2)

Used later (Phase 3) for long-term SQL-dump backups.

```sh
npx wrangler r2 bucket create ash-overseas-backups
```

> R2 requires enabling R2 once in the dashboard (Dashboard → R2 → _Enable_). It has a
> generous free tier. If you are not ready for backups yet, you may skip this and
> remove the `r2_buckets` blocks from `wrangler.jsonc` until Phase 3.

---

## 4. Apply database migrations

Migrations are generated from the Drizzle schema (`worker/db/schema.ts`) with
`pnpm db:generate` and live in `./migrations`. Apply them:

```sh
pnpm db:migrate:local   # local emulated D1 (for `pnpm dev`)
pnpm db:migrate:dev     # remote dev D1
pnpm db:migrate:prod    # remote prod D1 (uses --env production)
```

Whenever you change the schema: `pnpm db:generate` → review the new file in
`./migrations` → apply with the commands above. **Never hand-edit an applied migration.**

---

## 5. Run it locally

```sh
pnpm dev
```

Open the printed URL. You should see the Phase 0 scaffold with **"API OK"** and the
money-core check rendering **₹1,23,456.78**.

---

## 6. Deploy

```sh
pnpm deploy                      # deploys the default (dev-bound) worker
npx wrangler deploy --env production   # deploys the production worker + bindings
```

---

## 7. Authentication — Cloudflare Access email OTP (Phase 3)

This gates the whole app to just the owner's email, for free, with no custom auth code.
Do this when you reach Phase 3 (see `CLAUDE.md` → Security Blueprint L1).

1. In the Cloudflare dashboard: **Zero Trust → Access → Applications → Add an application**.
2. Choose **Self-hosted**. Give it a name (e.g. "ASH Overseas") and set the application
   domain to your deployed Worker's hostname.
3. **Identity / login methods:** enable **One-time PIN** (email OTP). No IdP needed.
4. **Add a policy:** Action **Allow**, rule **Emails** → add **only the owner's email**.
   (Optionally add the maintainer's email.)
5. Save. Note the application's **Application Audience (AUD) tag**
   (Access → your app → Overview) and your **team domain**
   (`<your-team>.cloudflareaccess.com`).
6. Put these in `.dev.vars` locally and as Wrangler secrets in production:
   ```sh
   npx wrangler secret put CF_ACCESS_AUD --env production
   npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --env production
   ```
   The app middleware verifies the `Cf-Access-Jwt-Assertion` header against these
   (defense-in-depth, so the raw `*.workers.dev` URL cannot bypass Access).

---

## 8. Optional — Drizzle Studio against remote D1

To browse the remote database with `pnpm db:studio`, create a scoped API token
(Dashboard → My Profile → API Tokens → Create → _D1 read/write_ for this account) and
put these in `.dev.vars`:

```
CLOUDFLARE_ACCOUNT_ID="..."
CLOUDFLARE_DATABASE_ID="..."   # the dev database id
CLOUDFLARE_D1_TOKEN="..."
```

(These are read by `drizzle.config.ts`; keep them out of git — `.dev.vars` is ignored.)

---

## Backups & restore

Two independent layers (NFR-B1/B2/B3):

### 1. Time Travel — 30-day point-in-time recovery (built in, no setup)

```sh
# See the current bookmark, or a bookmark at a timestamp:
npx wrangler d1 time-travel info ash-overseas-prod --env production
# Restore the DB to a moment (last 30 days):
npx wrangler d1 time-travel restore ash-overseas-prod --env production --timestamp="2026-07-08T09:00:00Z"
```

### 2. Off-store SQL dumps in R2 (long-term retention)

The production Worker runs a **nightly cron** (`triggers.crons` in `wrangler.jsonc`) that writes a
full `INSERT`-statement SQL dump to the R2 bucket under `backups/<timestamp>.sql`. Requires the
bucket (SETUP.md §3) and `wrangler deploy --env production`.

```sh
# List / download dumps:
npx wrangler r2 object list ash-overseas-backups --prefix backups/
npx wrangler r2 object get ash-overseas-backups backups/<timestamp>.sql --file restore.sql
```

**Restore a dump into a scratch DB (verify before trusting it):**

```sh
npx wrangler d1 create ash-overseas-restore-check          # scratch DB
npx wrangler d1 migrations apply ash-overseas-restore-check --remote   # create the schema
npx wrangler d1 execute ash-overseas-restore-check --remote --file restore.sql
# Spot-check row counts / a known dealer balance, then delete the scratch DB when done.
```

> ⚠️ **Perform and verify a restore at least once before handoff** (NFR-B3). The dump is data-only
> (`INSERT`s); apply migrations first so the tables exist. To restore over an existing DB, clear
> the tables first or prefer Time Travel.
