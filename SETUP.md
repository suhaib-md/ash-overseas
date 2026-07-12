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

## 3. Backups — no setup needed here

Backups are **card-free** (no R2): D1 Time Travel + `pnpm db:export`. See
[Backups & restore](#backups--restore) below. Nothing to provision at this step.

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
pnpm deploy        # builds + deploys the default (dev-bound) worker — for preview only
pnpm deploy:prod   # builds for prod + deploys the production worker + prod D1
```

> Always deploy production with `pnpm deploy:prod`, **never** `wrangler deploy --env production`.
> The Vite plugin selects dev-vs-prod at **build** time (via `CLOUDFLARE_ENV`), so passing
> `--env production` to a dev build silently targets the **dev** database. `pnpm deploy:prod`
> (`scripts/deploy-prod.mjs`) builds with `CLOUDFLARE_ENV=production` first. Full go-live sequence:
> [GO-LIVE.md](GO-LIVE.md).

---

## 7. Authentication — single-user password (Phase 3)

The app gates every page and `/api` route behind one password — no domain, no Cloudflare
Access, no IdP. It reads two Worker secrets: `AUTH_PASSWORD_HASH` (a PBKDF2 hash — the
plaintext is never stored) and `AUTH_SECRET` (signs the session cookie). If either is
unset, auth is **disabled** (open) — which is what you want for local dev. The full
production walkthrough is in [`GO-LIVE.md`](GO-LIVE.md) → Step 3; in short:

1. Generate both secrets: `node scripts/hash-password.mjs` (blank password = it generates a
   strong one and prints it once).
2. Set them in production (each `secret put` re-versions the Worker, so they apply immediately):
   ```sh
   npx wrangler secret put AUTH_PASSWORD_HASH --env production
   npx wrangler secret put AUTH_SECRET --env production
   ```
   To deploy code, use `pnpm deploy:prod` (never `wrangler deploy --env production` — the Vite
   plugin picks the env at build time; see GO-LIVE.md Step 2).
3. To test the login flow **locally**, put the same two lines in `.dev.vars` instead (see
   `.dev.vars.example`); remove them to go back to the open dev app.

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

**Card-free — no R2, no payment method.** Two independent layers (NFR-B1/B2/B3):

### 1. Time Travel — 30-day point-in-time recovery (built in, no setup)

The primary safety net. Instantly restore the live DB to any moment in the last 30 days:

```sh
npx wrangler d1 time-travel info ash-overseas-prod --env production
npx wrangler d1 time-travel restore ash-overseas-prod --env production --timestamp="2026-07-08T09:00:00Z"
```

### 2. SQL dumps for long-term / off-store retention

Export the whole prod DB to a `.sql` file (schema + data) whenever you like, and keep it wherever
you keep important files (Google Drive, an external drive, a private repo):

```sh
pnpm db:export        # → writes ./backup.sql (gitignored). Rename/move it, e.g. ash-2026-07-08.sql
```

Automate it with **Windows Task Scheduler** (run `pnpm db:export` weekly), **or** turn on the
opt-in GitHub Action (`.github/workflows/backup.yml`), which keeps each dump as a downloadable
artifact (90-day retention). To enable the Action, add two repo secrets
(GitHub → repo → Settings → Secrets and variables → Actions):

- `CLOUDFLARE_ACCOUNT_ID` — your account id (dashboard URL, or `wrangler whoami`)
- `CLOUDFLARE_API_TOKEN` — a token scoped to **D1 : Read** (My Profile → API Tokens → Create)

### Restore a dump into a scratch DB (verify before trusting it — NFR-B3)

```sh
npx wrangler d1 create ash-overseas-restore-check
# The dump already contains CREATE TABLE + INSERT, so load it straight into the empty DB
# (do NOT apply migrations first — that would collide with the dump's schema):
npx wrangler d1 execute ash-overseas-restore-check --remote --file backup.sql
npx wrangler d1 execute ash-overseas-restore-check --remote --command "SELECT count(*) FROM dealers;"
npx wrangler d1 delete ash-overseas-restore-check                      # clean up
```

> ⚠️ **Perform and verify a restore at least once before handoff.**
