# ASH Overseas — Production Go-Live Runbook

Every one-time step to take the app from "code-complete" to "live behind login and handed off".
Do them **in order** — later steps depend on earlier ones. Everything needs your Cloudflare/GitHub
accounts, so it can't be scripted for you.

> **Golden rule:** deploy **and** put it behind Cloudflare Access **before entering any real
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
pnpm db:migrate:prod                    # creates the schema in the prod D1 (type "yes")
npx wrangler deploy --env production     # uploads Worker + SPA
```

Wrangler prints a URL: `https://ash-overseas-prod.<your-subdomain>.workers.dev`. Open it — the app
loads (empty). **It is NOT protected yet — don't add real data.** Continue straight to Step 4.

If a later code change needs redeploying, it's just `npx wrangler deploy --env production` again.

---

## Step 3 — Put it on a custom domain (required for auth)

Cloudflare Access can only gate a **hostname in a zone you own** — it cannot protect a bare
`*.workers.dev` URL. So you need a domain in this Cloudflare account.

- **Have a domain here already?** Dashboard → **Workers & Pages → `ash-overseas-prod` → Settings →
  Domains & Routes → Add → Custom domain** → e.g. `ledger.yourdomain.com`. Cloudflare issues the TLS
  cert automatically (takes a minute).
- **No domain?** Cheapest path: **Dashboard → Domain Registration → Register Domain** (Cloudflare
  Registrar sells at wholesale cost, ~$5–10/yr, no markup), or add a domain you already own
  (Dashboard → Add a site → Free plan → change nameservers). Then do the "Add custom domain" step
  above.
- **Really don't want a domain?** Then don't deploy publicly — run it locally (`pnpm build && pnpm
  preview`) on your own machine/home network only. You lose phone-on-the-go access, but it needs no
  Access/domain. (Not recommended vs. a $8 domain.)

From here, use `https://ledger.yourdomain.com` as the app URL.

---

## Step 4 — Authentication: Cloudflare Access (email one-time PIN)

### 4a. Create your Zero Trust org (first time only)

Dashboard → **Zero Trust** (or `one.dash.cloudflare.com`). If prompted, pick a **team name** and the
free plan. Your **team domain** is `TEAMNAME.cloudflareaccess.com` — write it down, it's the
`CF_ACCESS_TEAM_DOMAIN` secret.

### 4b. Confirm email PIN login is on

Zero Trust → **Settings → Authentication → Login methods** → **One-time PIN** should be present
(on by default). No identity provider needed.

### 4c. Create the Access application

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

- **Name:** ASH Overseas
- **Session duration:** 24 hours (daily re-login — sensible for a phone)
- **Application domain:** `ledger.yourdomain.com` (from Step 3)
- **Next → Add a policy:** name "Owner"; Action **Allow**; **Include → Emails →** your email
  `suhaib.muhammed2002@gmail.com` (add the maintainer's email too, if they should log in)
- Save / Add application.

### 4d. Get the AUD tag and set the secrets

- Open the app → **Overview → Application Audience (AUD) Tag** → copy the long hex string. That's
  `CF_ACCESS_AUD`.
- Set both as Worker secrets, then redeploy:
  ```sh
  npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --env production   # paste TEAMNAME.cloudflareaccess.com
  npx wrangler secret put CF_ACCESS_AUD --env production           # paste the AUD tag
  npx wrangler deploy --env production
  ```

### 4e. Verify, then lock the back door

- Visit `https://ledger.yourdomain.com` in a fresh/incognito browser → you get the **email-OTP**
  screen → enter your email → paste the code → the app loads.
- **Disable the naked preview URL:** Workers & Pages → `ash-overseas-prod` → Settings → Domains &
  Routes → disable the `workers.dev` route so only the Access-protected domain serves the app.

✅ **Now it's safe to enter real data.**

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

1. **Security-headers scan:** paste `https://ledger.yourdomain.com` into `securityheaders.com` (or
   Mozilla Observatory). You should see **CSP, HSTS, X-Content-Type-Options, X-Frame-Options** — they
   come from `public/_headers`. Fix gaps by editing that file + redeploying.
2. **Rate limiting (WAF):** Dashboard → your domain → **Security → WAF → Rate limiting rules → Create**
   → e.g. path contains `/api/` → 100 requests / 1 min / per IP → Block. (Access already fronts the
   app; this is a backstop.)
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

pre-flight → deploy → custom domain → Access + secrets + redeploy → verify a restore → GitHub
secrets for backups → headers scan + WAF → invite maintainer. **No real data until Access is verified.**
