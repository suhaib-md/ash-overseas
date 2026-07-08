# ASH Overseas — Production Go-Live Runbook

The one-time steps to take the app from "code-complete" to "safely live and handed off".
Do them **in this order** — later steps depend on earlier ones. Everything here needs your
Cloudflare/GitHub accounts, so it can't be scripted for you.

> **Golden rule:** deploy **and** put it behind Access **before entering any real financial data**.
> There's a brief window where the app is deployed but not yet gated; that's fine while it's empty.

Facts you'll reuse:

- Repo: `github.com/suhaib-md/ash-overseas`
- Prod Worker name: `ash-overseas-prod` · prod D1: `ash-overseas-prod` (`7385f774-…`)

---

## Step 0 — Prerequisites (5 min)

```sh
node --version              # ≥ 22.15 (you have 24)
npx wrangler whoami         # confirms you're logged in; else: npx wrangler login
pnpm install && pnpm test:all && pnpm build   # everything green
```

---

## Step 1 — Deploy production

(Backups need **no provisioning** — they're card-free: Time Travel + `pnpm db:export`. See Step 3.)

```sh
pnpm db:migrate:prod                       # create the schema in the prod D1 (answer "yes")
npx wrangler deploy --env production        # deploys the Worker + SPA
```

Wrangler prints a URL like `https://ash-overseas-prod.<your-subdomain>.workers.dev`. Open it —
you should see the app (empty). **It is not yet protected** — don't add real data. Continue to
Step 3 immediately.

---

## 1 — Authentication: Cloudflare Access (email one-time PIN)

Access attaches to a **hostname in a zone you own**, so it can't gate a bare `*.workers.dev` URL.
You need a **custom domain on Cloudflare**.

### 1a. Put the app on a custom domain

- If you have a domain in this Cloudflare account: Dashboard → **Workers & Pages** →
  `ash-overseas-prod` → **Settings → Domains & Routes → Add → Custom domain** →
  e.g. `ledger.yourdomain.com`. Cloudflare provisions the cert automatically.
- No domain yet? Register or move one into this Cloudflare account first (even a cheap domain, or a
  subdomain of one you already manage here). _Access requires this — there's no secure way to gate a
  plain workers.dev URL._

### 1b. Create the Zero Trust org (first time only)

Dashboard → **Zero Trust** (or `one.dash.cloudflare.com`) → pick a **team name**. Your **team
domain** becomes `TEAMNAME.cloudflareaccess.com` — note it (this is `CF_ACCESS_TEAM_DOMAIN`).
The free plan (≤ 50 users) is enough.

### 1c. Turn on the email PIN login method

Zero Trust → **Settings → Authentication → Login methods** → ensure **One-time PIN** is enabled
(it is by default). No identity provider needed.

### 1d. Create the Access application

Zero Trust → **Access → Applications → Add an application → Self-hosted**.

- **Application name:** ASH Overseas
- **Session duration:** e.g. 24 hours (forces re-auth daily — good for a phone)
- **Public hostname:** `ledger.yourdomain.com` (from 1a)
- **Add policy:** Action **Allow**; **Include → Emails →** `suhaib.muhammed2002@gmail.com`
  (add the maintainer's email too if you want them to log in). Name it "Owner".
- Save.

### 1e. Grab the AUD and set the secrets

- Open the app → **Overview** → copy the **Application Audience (AUD) Tag** (a long hex string) →
  this is `CF_ACCESS_AUD`.
- Set both as Worker secrets and redeploy:
  ```sh
  npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --env production   # paste TEAMNAME.cloudflareaccess.com
  npx wrangler secret put CF_ACCESS_AUD --env production           # paste the AUD tag
  npx wrangler deploy --env production
  ```

### 1f. Verify

- Visit `https://ledger.yourdomain.com` in a fresh browser → you get the **Access email-OTP** page →
  enter your email → paste the code → the app loads.
- Confirm the bypass is closed: `curl https://ledger.yourdomain.com/api/dealers` (no login) → should
  be blocked by Access (302/403), and even if reached, the Worker returns **403** without a valid JWT.
- **Turn off the naked preview URL:** Worker → Settings → Domains & Routes → disable the
  `workers.dev` route so only the Access-protected domain serves the app.

✅ Now it's safe to enter real data.

---

## 3 — Backups (card-free) + verify a restore once

No R2, no card. Two layers:

- **Time Travel** (instant, built-in): restore the live DB to any moment in the last 30 days —
  `npx wrangler d1 time-travel restore ash-overseas-prod --env production --timestamp="<ISO>"`.
- **SQL dumps** for long-term/off-store: run `pnpm db:export` (writes `backup.sql`) and keep it in
  Drive / an external drive / a private repo. Automate with Windows Task Scheduler or the opt-in
  `.github/workflows/backup.yml` (add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` repo secrets).

**Prove a restore works, once:**

```sh
pnpm db:export                                   # → backup.sql (schema + data)
npx wrangler d1 create ash-overseas-restore-check
npx wrangler d1 execute ash-overseas-restore-check --remote --file backup.sql   # no migrations — dump has schema
npx wrangler d1 execute ash-overseas-restore-check --remote --command "SELECT count(*) FROM dealers;"
npx wrangler d1 delete ash-overseas-restore-check
```

---

## 4 — Hardening finish (on the live URL)

1. **Security-headers scan:** run the deployed URL through a scanner
   (e.g. `securityheaders.com` or Mozilla Observatory `observatory.mozilla.org`). You should see CSP,
   HSTS, X-Content-Type-Options, X-Frame-Options all present (they come from `public/_headers`). Fix
   any gaps by editing `public/_headers` and redeploying.
2. **Rate limiting / WAF:** Dashboard → your domain → **Security → WAF**. Add a simple
   **Rate limiting rule** (e.g. limit `/api/*` to ~100 requests/min per IP). Access already fronts
   the app, so this is a backstop.
3. **Dependabot:** it's already configured (`.github/dependabot.yml`) and CI runs `pnpm audit` — just
   confirm on GitHub → repo → **Settings → Code security** that Dependabot alerts are **on**.

---

## 5 — Handoff to the maintainer

1. **Repo:** GitHub → repo → **Settings → Collaborators → Add people** → the maintainer's GitHub user.
2. **Cloudflare:** Dashboard → **Manage Account → Members → Invite Member** → the maintainer's email
   → role **Administrator** (free plan allows members). They can then deploy and manage without your
   credentials.
3. Point them at [`README.md`](README.md) (maintainer runbook) and [`SETUP.md`](SETUP.md). Confirm
   they can, unaided: `pnpm install && pnpm test:all`, deploy, take a backup, and restore it.

---

### Quick order recap

deploy prod → custom domain → Access app + secrets + redeploy → verify a restore (`pnpm db:export`) →
headers scan + WAF → invite maintainer. **Don't enter real data until Access is verified.**
