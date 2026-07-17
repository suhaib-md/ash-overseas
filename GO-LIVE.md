# ASH Overseas — Production Go-Live Runbook

Every one-time step to take the app from "code-complete" to "live behind login and handed off".
Do them **in order** — later steps depend on earlier ones. Everything needs your Cloudflare/GitHub
accounts, so it can't be scripted for you.

> **Golden rule:** deploy **and** set your login password **before entering any real
> financial data.** There's a short window where it's deployed but not yet gated — fine while empty.

Facts you'll reuse:

- Repo: `github.com/suhaib-md/ash-overseas`
- Prod Worker: `ash-overseas-prod` · prod D1: `ash-overseas-prod` (`7385f774-…`)

---

## Step 1 — Pre-flight (2 min)

```sh
node --version            # ≥ 22.15 (you have 24)
npx wrangler whoami       # logged in? else: npx wrangler login
pnpm install && pnpm test:all && pnpm build   # all green
```

---

## Step 2 — Deploy to Cloudflare (production)

```sh
pnpm db:migrate:prod     # apply migrations to the prod D1 (type "yes" when prompted)
pnpm deploy:prod         # builds for the prod env, then uploads the Worker + SPA
```

> ⚠️ **Use `pnpm deploy:prod`, not `wrangler deploy --env production`.** The Vite plugin chooses
> dev-vs-prod at **build** time (via `CLOUDFLARE_ENV`) and bakes it into the bundle — a plain build
> plus `--env production` would deploy your code against the **dev** database. `pnpm deploy:prod`
> (see `scripts/deploy-prod.mjs`) builds with `CLOUDFLARE_ENV=production` first, so it always targets
> `ash-overseas-prod` + the prod D1.

Wrangler prints a URL: `https://ash-overseas-prod.<your-subdomain>.workers.dev`. Open it — the app
loads (empty). **It is NOT protected yet — don't add real data.** Continue straight to Step 3.

Any later redeploy is just `pnpm deploy:prod` again.

---

## Step 3 — Set up your login (username + password)

The app gates every page and every `/api` route behind a **username + password** — no domain, no
Cloudflare Access, no third-party IdP. How it's stored:

- The **username + password hash** live in the D1 `app_credentials` table (so you can change them
  from inside the app later — see below). The password is only ever a PBKDF2 hash.
- `AUTH_SECRET` (a random key that signs the session cookie) is the one **Worker secret**.

First make sure the credentials table exists (Step 2's `pnpm db:migrate:prod` already applied it —
run it again if unsure; it's idempotent). Then one script does the rest:

```sh
node scripts/setup-login.mjs        # prompts for username + password; blank password = generate one
```

It writes the username + hash into the **production** D1 and offers to set `AUTH_SECRET`
(answer **y** the first time). It uses `wrangler` under the hood; if `wrangler secret put` prints
`✨ Success!` and then seems to hang, that's a known Windows quirk — it already worked; press Ctrl-C.

> `AUTH_SECRET` is what turns the gate **on**. If it's unset the app runs **open** (intended for local
> dev only). On prod, always set it and verify below.

### Verify

- Open your app URL in a fresh/incognito window → you get the **login page** → sign in with your
  username + password → the app loads. Wrong credentials are rejected (with a deliberate ~½s delay).
- Hit any `/api/...` URL directly without logging in → **401**. There is no unauthenticated path.
- The session lasts 30 days.

### Changing username/password later

Two ways: **in the app** (header → the **account** icon → _Account_ → change username or password,
each needs your current password), or re-run `node scripts/setup-login.mjs`. Rotating `AUTH_SECRET`
(the script offers it) logs out any active session — do that if you suspect the cookie key leaked.

✅ **Now it's safe to enter real data.**

---

## Step 4 — Custom domain (optional — nicer URL)

The `*.workers.dev` URL works fine and is already protected by your login, so a domain is **not
required** — dropping the Cloudflare Access requirement is exactly why we no longer need one. If you'd
like a memorable URL like `ledger.yourdomain.com`:

- **Domain already in this account:** Dashboard → **Workers & Pages → `ash-overseas-prod` → Settings →
  Domains & Routes → Add → Custom domain**. Cloudflare issues the TLS cert automatically.
- **No domain:** **Dashboard → Domain Registration → Register Domain** (Cloudflare Registrar, wholesale
  ~$5–10/yr), or add one you already own (Add a site → Free plan → change nameservers), then do the
  step above.

Wherever the rest of this runbook says `ledger.yourdomain.com`, use your `workers.dev` URL instead if
you skip this step.

---

## Step 5 — Backups + verify a restore (card-free, no R2)

Two layers:

- **Time Travel** (built-in, instant): restore the live DB to any moment in the last 30 days.
- **SQL dumps** for long-term/off-store retention: `pnpm db:export`.

**Prove a restore works — do this once:**

```sh
pnpm db:export                                   # → backup.sql (schema + data; gitignored)
npx wrangler d1 create ash-overseas-restore-check
npx wrangler d1 execute ash-overseas-restore-check --remote --file backup.sql   # dump has schema; no migrations
npx wrangler d1 execute ash-overseas-restore-check --remote --command "SELECT count(*) FROM dealers;"
npx wrangler d1 delete ash-overseas-restore-check
```

Store each `backup.sql` wherever you keep important files (Drive / external drive / private repo).
Automate with Windows Task Scheduler, or the GitHub Action in Step 6.

Time Travel restore, if ever needed:

```sh
npx wrangler d1 time-travel restore ash-overseas-prod --env production --timestamp="2026-07-08T09:00:00Z"
```

---

## Step 6 — GitHub Actions

### 6a. CI (already active — nothing to configure)

`.github/workflows/ci.yml` runs on every push/PR: typecheck + unit tests + D1 tests + build +
`pnpm audit`. Check it: GitHub → repo → **Actions** tab → the latest **CI** run should be green.
If it's red, open the run to see which step failed.

### 6b. Automated backups (opt-in — needs 2 secrets)

`.github/workflows/backup.yml` runs weekly (and on demand) and keeps each DB dump as a downloadable
artifact (90-day retention). It does nothing until you add the secrets:

1. **Create a scoped Cloudflare API token:** Dashboard → **My Profile** (top-right avatar) →
   **API Tokens → Create Token → Create Custom Token**.
   - Name: `ash-overseas-backup`
   - **Permissions:** `Account` → `D1` → **Edit** (Edit is the safe choice; export is read-only but
     the D1 group is Read/Edit).
   - **Account Resources:** Include → your account.
   - Continue → Create → **copy the token** (shown once).
2. **Find your Account ID:** run `npx wrangler whoami` (it prints the Account ID), or Dashboard →
   Workers & Pages → right sidebar **Account ID**.
3. **Add repo secrets:** GitHub → repo → **Settings → Secrets and variables → Actions → New
   repository secret**, add two:
   - `CLOUDFLARE_API_TOKEN` = the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID` = the id from step 2
4. **Run it now to test:** Actions tab → **Backup (D1 export)** → **Run workflow** → after it
   finishes, open the run → **Artifacts** → download `d1-backup-…` (that's your `backup.sql`).

---

## Step 7 — Hardening (on the live URL)

1. **Security-headers scan:** paste your app URL (workers.dev or your domain) into `securityheaders.com`
   (or Mozilla Observatory). You should see **CSP, HSTS, X-Content-Type-Options, X-Frame-Options** —
   they come from `public/_headers`. Fix gaps by editing that file + redeploying.
2. **Rate limiting (WAF, needs a custom domain):** if you did Step 4, Dashboard → your domain →
   **Security → WAF → Rate limiting rules → Create** → e.g. path contains `/api/` → 100 requests /
   1 min / per IP → Block. (Your login already gates the app; this is a backstop against brute-forcing
   the password endpoint.) On a bare `workers.dev` URL zone-WAF isn't available — the login's ~½s
   wrong-password delay is the backstop there.
3. **Dependabot alerts:** GitHub → repo → **Settings → Code security** → ensure Dependabot alerts +
   security updates are **enabled** (`.github/dependabot.yml` already opens weekly PRs).

---

## Step 8 — Handoff to the maintainer

1. **Repo:** GitHub → repo → **Settings → Collaborators → Add people** → maintainer's GitHub username.
2. **Cloudflare:** Dashboard → **Manage Account → Members → Invite Member** → maintainer's email →
   role **Administrator** (allowed on the free plan). They can now deploy without your credentials.
3. Point them at [`README.md`](README.md) (maintainer runbook) + this file. Confirm they can, unaided:
   `pnpm install && pnpm test:all`, deploy, `pnpm db:export`, and restore it.

---

### One-line recap

pre-flight → deploy → set login password (secrets + redeploy) → _(optional custom domain)_ → verify a
restore → GitHub secrets for backups → headers scan + WAF → invite maintainer. **No real data until
login is verified.**
