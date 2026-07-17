# ASH Overseas — Trading Ledger

This is a private, internal web application for ASH Overseas (a trading business dealing in metal castings, scrap, and similar materials). It replaces paper ledgers with a digital record of goods transactions and money movements with dealers, maintaining two parallel valuations of every shipment.

The full specification lives in `SRS.md`. When in doubt about any business rule, the SRS is authoritative.

---

## Project Status

- **Phase 0** (foundations & setup) — ✅ complete
- **Phase 1** (core ledger) — ✅ complete: pure engine + atomic posting layer + dealer/transaction/money-movement APIs + minimal dealer-detail UI. Section 6 passes at both the pure and D1-integration level (55 tests green).
- **Phase 2** (usability/completeness) — ✅ complete: real routing + Home/nav; full entry flows with draft persistence; void UI (reversal shown); per-transaction GST split (CGST/SGST vs IGST) + round-off; success toasts, item/unit autocomplete, modal a11y, installable PWA (shell-only cache). 59 tests green (43 unit + 16 D1/API).
- **Phase 3** (auth/hardening/handoff) — code-complete: **single-user username + password auth** (credentials in the D1 `app_credentials` table, changeable in-app under _Account_; PBKDF2 hash capped at 100k iters per the Workers runtime limit + HMAC-signed session cookie via `AUTH_SECRET`, all Web Crypto so it runs in workerd and the Node test runner) replacing the earlier Cloudflare Access plan (Access needs a custom domain the owner wants to avoid; a bare `workers.dev` URL can now go live), a branded login landing page, security headers (CSP/HSTS), card-free backups (D1 Time Travel + `pnpm db:export`, optional GitHub Action) + documented restore, in-app audit-log view, CI (typecheck/tests/build/audit) + Dependabot, README + maintainer + GO-LIVE runbooks. 65 tests green. **Remaining is owner/maintainer provisioning** (deploy, provision the login via `scripts/setup-login.mjs`, optional custom domain, run an observatory scan, verify a restore, invite the maintainer, optional WAF/rate-limit rules) — see GO-LIVE.md.

The detailed, sequenced build plan (sub-phases, steps, and "Done when" gates) is in **[Delivery Plan (Detailed)](#delivery-plan-detailed)** at the end of this file. Cross-cutting engineering, security, and UI/UX rules live in their own sections and are referenced from the phases.

---

## The Two Core Ideas (Read First)

Everything in this codebase serves two ideas. Keep them in mind at all times.

### 1. Dual valuation

Every goods transaction is recorded at two rates simultaneously:

- **Actual rate** — the real negotiated price the business runs on
- **Current rate** — the declared/invoiced price used for GST and official paperwork

These describe the **same physical goods**. They are never two separate transactions. The current rate is entered freely per line — it is not derived from the actual rate and is not constrained to be lower (though it usually is).

GST is always computed on the **current value**, never the actual value. The resulting GST amount posts as real cash in the actual account.

### 2. One consolidated balance per dealer

Each dealer has **one signed running balance per account** (actual, current). There are no advance buckets, no FIFO matching, no separate purchase/sale sub-balances. A dealer who both buys and sells appears in both lists but has one balance that reflects everything.

---

## Sign Convention

Signs are from the **business's point of view**:

- **Positive balance** → dealer owes the business (receivable)
- **Negative balance** → business owes the dealer (payable / advance held)
- **Zero** → settled

```
running_balance = Σ(debit) − Σ(credit)
```

The UI never shows raw signs. It always renders:

- `"Dealer owes you ₹X"` when positive
- `"You owe dealer ₹X"` when negative
- `"Settled"` at zero

---

## Posting Rules (Section 7 of SRS)

| Event                        | Actual account                      | Current account                         |
| ---------------------------- | ----------------------------------- | --------------------------------------- |
| Sale (goods to dealer)       | debit (actual goods value + GST)    | debit (current goods value + GST)       |
| Purchase (goods from dealer) | credit (actual goods value + GST)   | credit (current goods value + GST)      |
| Money received from dealer   | credit (amount)                     | credit — only if scope includes current |
| Money paid to dealer         | debit (amount)                      | debit — only if scope includes current  |
| Void / correction            | reversing entry, equal and opposite | reversing entry, equal and opposite     |

Key rule: GST posts to the **actual** account as real cash (it is real money that changes hands), but is computed on the **current** value. See Scenario B in SRS §6.2 for the worked example.

Money movements have an `account_scope` field (`actual`, `current`, `both`). Default is `actual`. Cash advances typically only hit the actual account; official bank receipts against invoices may hit both.

---

## GST Computation

```
line_gst_paise = round(current_amount_paise × gst_rate / 100)
```

- **Intra-state (TN):** split into CGST + SGST, each half. Display only — the ledger uses the single total.
- **Inter-state:** full amount is IGST.
- **None:** no GST.

Invoice grand total (current side) is rounded to the nearest rupee. The difference is stored as `round_off_paise`. Rounded totals post to the ledger.

---

## Money Rule: Integer Paise Everywhere

**All monetary values are stored as integer paise (₹1 = 100 paise).** No floating-point money exists anywhere in the system — not in the DB, not in computation, not in API responses. Rupee formatting (`₹1,23,456.78`) happens only at display/render time.

If you find yourself using `parseFloat`, `toFixed`, or a `number` type for money, stop and fix it.

---

## Ledger Integrity Rules

1. The ledger is **append-only**. No financial row is ever hard-deleted or updated in a way that changes its monetary effect.
2. Corrections work by posting a **reversing entry** (equal and opposite), flagging the source `is_voided = true`, and writing an audit log entry.
3. Every `ledger_entries` row must trace back to a source record via `source_type` and `source_id`.
4. Opening positions are `ledger_entries` rows with `source_type = 'opening'` — never mutable balance fields on the dealer record.
5. All writes that produce multiple ledger entries must occur inside a single **database transaction**.

### Replay Function

`recomputeLedger(dealerId, account)` is a pure function that replays all non-voided entries for a dealer/account in date order and recomputes running balances from zero. It must be called after any void to restore correct balances. The Section 6 scenarios in the SRS are its expected outputs and are implemented as automated tests.

---

## Technology Stack

Deployment path verified current **2026-07** — the Cloudflare + Next.js story changed, so follow this exactly:

| Layer      | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Notes                                                                                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | **Next.js (App Router)** via the **OpenNext Cloudflare adapter** (`@opennextjs/cloudflare`), deployed to Cloudflare **Workers**.                                                                                                                                                                                                                                                                                                                                                   | `@cloudflare/next-on-pages` and the Pages deploy path are **deprecated** — do **not** use them. Sanctioned lighter alternative for this single-user tool: **Vite + React SPA + Hono API on Workers** (fewer moving parts; keeps the posting API explicit). Confirm the choice in Phase 0.2 before scaffolding. |
| Runtime    | Cloudflare Workers with Node.js compatibility (via OpenNext)                                                                                                                                                                                                                                                                                                                                                                                                                       | Gives Node APIs the old Edge runtime lacked.                                                                                                                                                                                                                                                                   |
| Database   | Cloudflare D1 (SQLite)                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Separate dev and prod** D1 databases are mandatory.                                                                                                                                                                                                                                                          |
| ORM        | Drizzle ORM + drizzle-kit                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Canonical schema is SRS §12.                                                                                                                                                                                                                                                                                   |
| Migrations | `drizzle-kit generate` authors the SQL; **`wrangler d1 migrations apply`** applies it (`--local` for dev, remote for prod).                                                                                                                                                                                                                                                                                                                                                        | Never hand-edit an already-applied migration; add a new one.                                                                                                                                                                                                                                                   |
| Validation | **Zod** at every server boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Rejects non-integer money and out-of-range input — see Security Blueprint.                                                                                                                                                                                                                                     |
| Testing    | **Vitest** for the pure ledger engine; **`@cloudflare/vitest-pool-workers`** for D1-backed integration tests                                                                                                                                                                                                                                                                                                                                                                       | The Section 6 scenarios are the gating suite.                                                                                                                                                                                                                                                                  |
| Auth       | **Single-user username + password** gating the whole app: username + PBKDF2-SHA256 password hash stored in the D1 `app_credentials` table (changeable in-app), plus an HMAC-signed session cookie (`AUTH_SECRET`, the only Worker secret), all via Web Crypto so it runs in both workerd and the Node test runner. Cloudflare Access was the original plan but needs a custom domain the owner wants to avoid; this gate protects a bare `workers.dev` URL with no domain, no IdP. | See Security Blueprint L1. `AUTH_SECRET` unset ⇒ auth disabled (local-dev convenience only). Session TTL 30 days; ~½s delay + 401 on wrong creds. **PBKDF2 capped at 100k iters (Workers limit).**                                                                                                             |
| Backups    | **Card-free** (R2 needs a payment card, so it is NOT used): D1 **Time Travel** (always-on, 30-day PITR, no cost) **plus** `wrangler d1 export` SQL dumps (`pnpm db:export`), optionally automated by a GitHub Action to an artifact.                                                                                                                                                                                                                                               | Satisfies NFR-B1/B2/B3. Restore must be _performed and verified_ before handoff.                                                                                                                                                                                                                               |
| Money      | Integer paise — no exceptions                                                                                                                                                                                                                                                                                                                                                                                                                                                      | See Money Rule + Engineering Foundations.                                                                                                                                                                                                                                                                      |

Secrets and bindings (D1, R2, Access) are configured through Cloudflare's environment (`wrangler secret`, the dashboard, or `.dev.vars` locally — `.dev.vars` is gitignored), **never** committed to source control.

**Why these choices (research summary):** OpenNext-on-Workers is the path the Next.js team and Cloudflare now recommend, replacing the deprecated `next-on-pages`; D1 Time Travel provides free 30-day PITR with scheduled R2 export for longer retention; Drizzle authors migrations that `wrangler` applies; a single-user password gate (PBKDF2 + signed session cookie) protects the tool on a bare `workers.dev` URL — chosen over Cloudflare Access, which would have required buying/configuring a custom domain.

---

## Database Schema

The canonical Drizzle schema is in SRS §12. Tables:

- `dealers` — identity, GSTIN, state code, type (`supplier`/`buyer`/`both`). Type is a list filter only — it never splits the balance.
- `transactions` — one goods deal. Has `human_id` (e.g. `SALE-2026-06-0039`), `reference_tag` (owner's label e.g. `ASH 39`), `mode`, `tax_type`, optional invoice fields, `discount_paise`, `freight_paise`, `round_off_paise`.
- `transaction_lines` — per-item dual valuation. Both `actual_amount_paise` and `current_amount_paise` are stored; `gst_amount_paise` is computed on current value.
- `money_movements` — advances, payments, receipts. Has `direction` (`received`/`paid`), `account_scope`, optional `method`.
- `ledger_entries` — the append-only ledger. Has `debit_paise`, `credit_paise`, `running_balance_paise`. Source traced via `source_type` + `source_id`.
- `audit_log` — every create/void/edit with before/after JSON.

---

## Acceptance Tests (Section 6 of SRS)

These scenarios must pass as automated tests before Phase 1 is complete. They are the ground truth for the ledger engine.

**Scenario A** — Bidirectional cash and goods flow. Single balance moves in both directions.

**Scenario B** — Advance against two shipments. Sale debits actual account by `actual_goods_value + invoice_GST` where GST is computed on current value. Final balance: −₹1,17,502 ("You owe dealer ₹1,17,502").

**Scenario C** — Same two shipments on the current account. Advance does not appear (it was actual-only). Invoice totals: ASH 39 = ₹2,69,323; ASH 42 = ₹2,19,952.

**Scenario D** — Balance crossing zero. After Scenario B, a further sale of ₹2,00,000 (actual + GST) flips the balance to +₹82,498 ("Dealer owes you ₹82,498").

---

## What Is Out of Scope

Do not add, suggest, or build any of the following — they are explicitly excluded by the SRS:

- Item/material/HSN master
- GST rate master
- Advance allocation / FIFO matching
- Integration with or export to external accounting software
- Generation of legal invoices or tax returns
- Bulk data import
- Analytics, ageing, or reporting dashboards
- Multi-user roles or public sign-up

---

## UI Rules

- Amounts always display in rupees with Indian thousands separators, e.g. `₹1,23,456.78`. Conversion from paise at render time only.
- Balances always have a plain-language direction label. Never a bare `+` or `−`.
- Voided entries are shown struck through with their reversing entry shown adjacent.
- The application must be usable on a phone browser (entries are often made on the move).
- Free-text fields (item name, unit) have no fixed vocabulary. Autocomplete suggestions from past entries are welcome but never required.

---

## Validation Rules

- Quantity and rates: non-negative numbers; at least one line item required per transaction.
- Money movement amount: greater than zero.
- GST rate: 0–100.
- Date: required; not in the future beyond today.
- Dealer: must exist and not be archived.

---

## Engineering Foundations

These rules are correctness-critical for a financial ledger. Treat a violation as a bug, not a style nit.

### Numeric precision

- All money is `integer` paise (see Money Rule). JS numbers are exact integers below 2^53 (≈ ₹90 trillion in paise) — far above anything this business will ever see — so a plain `number` is safe for storage and transport. **BigInt is unnecessary at this scale.** The rule is not "avoid `number`," it is "never let a fractional/`float` money value exist."
- **One money-math module owns every arithmetic operation on paise.** No ad-hoc `*`, `/`, or `Math.round` on money anywhere else in the codebase.
- Rounding is **half-up to the nearest paise** via a single shared `roundPaise(x)` helper:
  - Line amount = `roundPaise(quantity × rate_paise)` (quantity is `real`, so the product can be fractional).
  - `line_gst_paise = roundPaise(current_amount_paise × gst_rate / 100)`.
  - `CGST = SGST = roundPaise(current_amount_paise × gst_rate / 200)` each, computed independently (they may differ from `gst/2` by one paise; that is correct).
  - Invoice grand total (current side) rounds to the nearest **rupee**; `round_off_paise = rounded − raw`; the **rounded** total posts to the ledger. Worked example (SRS §8.3): ₹2,28,240 @ 18% → raw ₹2,69,323.20 → posts ₹2,69,323.00, round-off −₹0.20.

### Ledger engine shape

- The ledger engine is a **pure module with no DB imports**: given a prior balance and an event, it returns the entries to post. This is exactly what the Section 6 tests exercise.
- A thin **posting layer** wraps the pure engine and performs the DB writes.
- `recomputeLedger(dealerId, account)` replays all non-voided entries in deterministic order and rewrites running balances from the opening entry (or zero). Called after every void.

### Atomicity & determinism

- D1 does **not** offer interactive `BEGIN…COMMIT` transactions over the Workers binding. Use **`db.batch([...])`** (Drizzle/D1 batch) so all ledger rows for one event commit atomically or not at all. Every multi-entry write MUST be a single batch. (This is how "single database transaction" in the Ledger Integrity Rules is implemented on D1.)
- The replay/order key is **`(entry_date, id)`** — a stable tiebreak for entries that share a date. Never rely on insertion order alone; never sort money by a float.
- Running balances are computed at write time from the previous entry (single-user makes this safe) and recomputed by replay after any void.

### Identifiers (resolves SRS §18 open item)

- `human_id` format: **`{MODE}-{YYYY}-{MM}-{NNNN}`** (e.g. `SALE-2026-06-0039`), a zero-padded sequence scoped to mode + month. Derive the next sequence inside the same `db.batch` that inserts the transaction so it is collision-safe under the single-writer assumption.

---

## Security Blueprint

This app holds both **real and declared** financial figures for a business — a leak is materially damaging. Authentication is a Phase-3 deliverable, but these constraints **bind from Phase 0**. Defense in depth across four layers:

### Layer 1 — Login gate (the app authenticates every request itself)

- **Single-user username + password** gates the entire application — every page and every `/api` route. There is no public route and no self-service sign-up (NFR-S1/S5). Auth is enforced **in the Worker**, so a bare `workers.dev` URL is fully protected with no custom domain required (this is why Cloudflare Access was dropped — it can only gate a hostname in a zone you own).
- **How it works** (`worker/auth.ts` + `worker/repo/credentials.ts`): the username + PBKDF2-SHA256 password hash (format `pbkdf2$<iters>$<salt>$<hash>`) live in the D1 `app_credentials` table (one row) — **not** env secrets — so the owner can change them from inside the app (the Worker can't rewrite its own secrets). A correct login mints an **HMAC-signed session cookie** (`AUTH_SECRET`) with a 30-day expiry, `HttpOnly; Secure; SameSite=Strict`. Every `/api/*` request except the public auth endpoints (`/api/auth/login|me|logout`) verifies the cookie; the credential-change routes (`/api/auth/change-password|change-username`) sit **behind** the gate AND re-require the current password. A wrong login gets a deliberate ~½s delay before its 401. `AUTH_SECRET` is the only secret and turns the gate on: unset ⇒ **disabled** (local dev only); production always sets it. **PBKDF2 iterations are capped at 100k** — the Workers runtime throws `NotSupportedError` above that (miniflare/Node don't, so a higher value silently passes tests then fails in prod).
- HTTPS only; **HSTS** with a long `max-age` + preload (NFR-S4). Cloudflare WAF + rate-limiting rules can sit in front as a backstop (needs a custom domain; otherwise the login's throttled wrong-password path is the backstop).

### Layer 2 — Transport & headers (set on every response)

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy`: `default-src 'self'`; no inline scripts (use nonces/hashes if unavoidable); `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a minimal `Permissions-Policy` (disable camera/mic/geolocation/etc.).
- Any app cookie: `Secure`, `HttpOnly`, `SameSite=Strict`.

### Layer 3 — Application

- **Validate every input with Zod at the server boundary.** Never trust the client. Money fields accept **integer paise only** — reject floats, `NaN`, disallowed negatives, and out-of-range values. Re-run every SRS §10.8 rule server-side even if the client also checks.
- Every ledger-mutating endpoint is behind the session-cookie check; there is no unauthenticated write path.
- **SQL injection:** only parameterized Drizzle queries — never string-concatenate SQL.
- **CSRF:** verify `Origin`/`Sec-Fetch-Site` on state-changing routes; cookies `SameSite=Strict`; same-origin POST. (The `SameSite=Strict` session cookie already blocks cross-site sends, but keep this.)
- **No money or dealer PII in logs, error traces, or analytics (NFR-S3).** A logging helper redacts amount / name / GSTIN fields. Do not wire a third-party analytics or error-reporting SaaS that would receive request bodies; if one is ever added, scrub payloads first.
- The **audit log is append-only**, records who/what/when with before/after JSON (NFR-A1), and never stores secrets.

### Layer 4 — Data & supply chain

- Secrets live only in `wrangler secret` / env bindings / `.dev.vars` (gitignored). Nothing sensitive in the repo, ever. Rotate on any suspicion.
- D1 is encrypted at rest (platform); R2 backups inherit encryption at rest.
- Separate dev/prod databases; dev never holds real financial data unless protected identically.
- **Supply chain:** commit a lockfile; enable Dependabot/Renovate; run `npm audit` in CI; pin OpenNext/wrangler/Drizzle versions; minimize dependencies — each one is attack surface.
- Ledger integrity itself (append-only, reversing entries, traceable source, atomic batch) is a **security property** — it prevents silent tampering. See Ledger Integrity Rules.

### Threat model (what we defend against)

Unauthorized read of financial data (→ password gate + signed session cookie + no public route); tampering with historical figures (→ append-only + audit + replay); accidental data loss (→ Time Travel + SQL-dump export + tested restore); secret leakage (→ env-only secrets, none in logs); dependency compromise (→ lockfile, `npm audit`, minimal deps). **Out of model:** nation-state adversaries and theft of the owner's already-unlocked phone (mitigated only by the 30-day session expiry / logout).

---

## UI/UX Blueprint

The owner enters records on a phone, on the move, often in a hurry. The interface must be fast, unambiguous about money direction, and hard to fat-finger into a wrong figure. Builds on the UI Rules above.

**Visual foundation:** the concrete theme is the **[Design System](DESIGN_SYSTEM.md)** — a light, clean, institutional Material-3 language. Tokens (colours incl. the semantic `positive`/`negative`/`neutral` balance pairs, typography, named spacing) live in `src/index.css` (`@theme`, Tailwind v4) and are the **single source of truth** — never hard-code hex/px in components. Inter is self-hosted (`@fontsource-variable/inter`); icons are `lucide-react`; no CDNs/external fonts (CSP). The mockups' visual language was adopted mobile-first; their out-of-scope features (analytics dashboard, CSV/email/PDF export, exchange rates, notifications, uploads) were **not** — see the Design System's exclusions.

### Principles

- **Mobile-first, thumb-first.** Design for a 360px-wide phone first; desktop is the enhancement. Primary actions (add transaction, add money) sit within thumb reach with large tap targets (≥44px).
- **The balance is the hero.** Every dealer screen leads with the plain-language headline (SRS §5): _"Dealer owes you ₹X" / "You owe dealer ₹X" / "Settled."_ Big type, colour **and** icon/label (never colour alone — for colourblind users and screen readers).
- **Two views, one truth.** Actual/Current are tabs over one dealer (a segmented control), with a one-line reminder that they describe the _same goods_. Never let the user think they are two separate ledgers.
- **Show the math live.** The transaction form shows, as the user types: actual total, current/invoice total, GST split (CGST+SGST or IGST), round-off, and grand total. No surprises on save.

### Information architecture (SRS §10)

`Home` (Purchase | Sale + dealer list with inline actual balances + "new dealer") → `Dealer list (per activity)` (search, inline balances) → `Dealer detail` (Actual | Current tabs; headline; chronological entries each with running balance; add-transaction / add-money / void actions). The Current tab additionally surfaces invoice no/date, tax type, and GST per transaction.

### Money input (critical)

- Users type **rupees** (e.g. `3,13,830` or `313830.50`); a `MoneyInput` component parses to **integer paise** and emits paise only. Form state never holds a float rupee value.
- Live-format the field to Indian grouping while typing; show the parsed paise on blur for confidence.
- Curtail input beyond 2 decimal places; empty ≠ 0 where a value is required.
- Rate × quantity and GST recompute live via the money-math module — never `toFixed`.

### Formatting

- A single `formatPaise(paise)` util renders `₹1,23,456.78` via `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`, formatting **from paise** so no float artefact appears. Use it everywhere; no ad-hoc formatting.
- Dates default to today, block future dates (SRS §10.8), display as `DD MMM YYYY`.

### Component inventory (build once, reuse)

`BalanceHeadline`, `MoneyInput`, `MoneyDisplay`, `AccountTabs` (Actual/Current), `LedgerEntryRow` (voided → struck-through with adjacent reversal), `TransactionForm` (repeatable `LineItemRow` + live summary), `MoneyMovementForm`, `DealerRow` (name + inline balance), `DealerPicker`, `TaxTypeSelect`, `ConfirmVoidDialog`, `EmptyState`, `ErrorState`, `Toast`.

### States & feedback

- Every screen defines **loading, empty, and error** states explicitly.
- Voids require a confirmation dialog and show the reversing entry adjacent to the struck-through original (SRS §10.7).
- Save gives clear success feedback; on failure, **keep the user's input**.
- **Draft persistence:** the transaction/money forms autosave in-progress input to `localStorage`, so a dropped mobile connection or an accidental back-navigation never loses a half-typed entry. This is the pragmatic answer to "entered on the move" — _not_ full offline sync, which would conflict with the single-source-of-truth ledger.

### Accessibility & polish

- Semantic HTML, real `<label>`s, visible focus, AA contrast, no meaning by colour alone, screen-reader text spelling out the balance direction.
- Installable **PWA** (manifest + icon) so the owner launches it like an app — cache the app shell only; never cache financial data (stale balances are dangerous).
- Autocomplete item name/unit from past entries (suggest, never require — NFR-U3).
- Sub-second dealer list/detail loads served from the **stored** running balance, never a recompute (NFR-P1/P2).

---

## Delivery Plan (Detailed)

This refines SRS §19 into sequenced, verifiable work. It does **not** change scope — the SRS §17 boundaries and the §6 acceptance tests remain authoritative. Each sub-phase lists its steps and a **Done when** gate; do not start the next phase until the current gate is green. Cross-cutting work references the Engineering Foundations, Security Blueprint, and UI/UX Blueprint above.

### Phase 0 — Foundations & setup

_Goal: a deployable skeleton with the money/ledger primitives and the test harness in place, so Phase 1 builds on solid ground._

**0.1 Repo & tooling**

- `git init`; Node project; TypeScript **strict**; ESLint + Prettier; commit the lockfile.
- `.gitignore`: `.dev.vars`, `.wrangler`, `node_modules`, build output, any `*.sqlite`.
- **Done when:** `npm run build` succeeds and the repo is clean.

**0.2 Framework decision & scaffold**

- Confirm framework (Next.js + OpenNext on Workers vs Vite + React + Hono — see Technology Stack) and scaffold it.
- **Done when:** `npm run dev` serves a page locally on Workers (miniflare) and a preview deploy to Workers succeeds.

**0.3 Cloudflare wiring**

- Create **dev + prod** D1 databases and the **R2** backup bucket; add bindings to `wrangler.jsonc`; put local secrets in `.dev.vars`.
- **Done when:** a trivial read/write works against `--local` D1 and against a remote preview.

**0.4 Money & math core**

- Implement the money-math module (`roundPaise`, line amount, GST, CGST/SGST split, invoice round-off) per Engineering Foundations, with exhaustive unit tests including the SRS §8.3 example (₹2,28,240 @ 18% → round-off −₹0.20).
- Implement `formatPaise` and `parseRupeesToPaise` with tests (Indian grouping, 2-dp, rejects floats/negatives).
- **Done when:** money/format tests pass and no `parseFloat`/`toFixed` touches money anywhere.

**0.5 Schema & migrations**

- Author the Drizzle schema **exactly** per SRS §12. Generate the first migration; apply to local and prod via `wrangler d1 migrations apply`.
- Add indexes for hot paths: `ledger_entries(dealer_id, account, entry_date, id)`, `transactions(dealer_id)`, `money_movements(dealer_id)`, `dealers(is_archived)`.
- **Done when:** migrations apply cleanly on a fresh dev DB and the schema round-trips through Drizzle.

**0.6 Test harness**

- Wire Vitest (pure) + `@cloudflare/vitest-pool-workers` (D1 integration). Encode the four Section 6 scenarios as fixtures now — expected **red** until Phase 1.
- **Done when:** the runner executes and the Section 6 suite is present and failing for the right reason.

### Phase 1 — Core ledger engine

_Goal: the ledger is correct and provably so. UI is minimal/functional; polish comes in Phase 2._

**1.1 Pure ledger engine**

- Implement the posting rules (SRS §7) as pure functions (events → ledger entries) over the money-math core: sale/purchase dual-account posting, money-movement scope handling, reversing entries. Implement `recomputeLedger` with the `(entry_date, id)` order key.
- **Done when:** **all four Section 6 scenarios pass** as unit tests — exact figures, including −₹1,17,502 (B) and the +₹82,498 zero-crossing (D).

**1.2 Posting layer & atomic writes**

- Wrap the engine with DB writes via `db.batch(...)` so each event's entries commit atomically; compute running balance from the previous entry; trace every entry to its source; opening positions as `opening` entries.
- **Done when:** integration tests reproduce Section 6 through the real D1 path, and a forced mid-batch failure leaves **no** partial rows.

**1.3 Dealer CRUD**

- Create/edit/archive dealers (FR-D1..D5), optional opening entry per account, server-side Zod validation.
- **Done when:** a dealer can be created, archived (history retained), and seeded with an opening balance visible in the ledger.

**1.4 Transactions with dual valuation + GST**

- Create purchase/sale with ≥1 line, dual rates, per-line GST on current value, tax type, `human_id` generation; post to both accounts on save (FR-T1..T8).
- **Done when:** a saved transaction posts correct actual & current entries and updates both balances; Scenario B/C figures reproduce end-to-end.

**1.5 Money movements**

- Record received/paid with account scope (FR-M1..M3); post per scope.
- **Done when:** an actual-only advance moves only the actual balance; a `both`-scope receipt moves both.

**1.6 Minimal dealer detail**

- Read-only Actual/Current tabs with the plain-language headline and chronological entries + running balance (FR-L1..L4). Function over form.
- **Done when:** the headline and history render correctly for a dealer exercising every event type.

**Phase 1 gate:** every Section 6 scenario passes at both the pure and the D1-integration level; balances read from stored values; nothing hard-deletes a financial row.

### Phase 2 — Usability & completeness

_Goal: pleasant and complete to operate on a phone. Implements the UI/UX Blueprint._

**2.1 Home & navigation** — Purchase/Sale, dealer list + inline actual balances, new-dealer, per-activity filtered lists with search (FR-N1..N3). **Done when:** the SRS §10.1 navigation map is fully traversable on mobile.

**2.2 Entry flows** — full `TransactionForm` (repeatable line items, live summary with GST split + round-off) and `MoneyMovementForm` using `MoneyInput` with draft persistence; all optional fields: invoice no/date, reference tag, discount, freight, credit/debit-note marker, notes (FR-T5/T6, §8.4/8.5). **Done when:** a full sale with discount/freight/round-off and an inter-state tax type saves and reconciles to the live summary.

**2.3 Void & correction** — reversing entry + `is_voided` + audit row + `recomputeLedger` (FR-A1, §13.3); confirmation dialog; struck-through original with adjacent reversal. **Done when:** voiding any entry restores the exact pre-entry balance via replay and the UI shows the reversal.

**2.4 GST intra/inter & display** — tax-type handling end to end; CGST/SGST vs IGST display; round-off shown (§8.1–8.3). **Done when:** intra-state shows split halves summing to the total, inter-state shows IGST, and the ledger uses the single total.

**2.5 Phone polish & a11y** — full UI/UX Blueprint: responsive layout, loading/empty/error states, toasts, autocomplete suggestions, PWA install, accessibility pass. **Done when:** comfortably usable one-handed on a 360px phone and passing a basic a11y audit.

### Phase 3 — Hardening & handoff

_Goal: safe to run unattended and to hand to a maintainer._

**3.1 Authentication** — single-user password over the whole app: PBKDF2 password hash + HMAC-signed session cookie enforced in the Worker on every `/api` route; security headers; no public route (Security Blueprint L1–L2). **Done when:** unauthenticated `/api` requests are rejected (401), a wrong password is rejected, and a correct password mints a working session.

**3.2 Backups & verified restore** — card-free (no R2): D1 Time Travel + `wrangler d1 export` SQL dumps (`pnpm db:export`), optionally automated via a GitHub Action; **document and actually perform** a restore into a scratch DB (NFR-B1..B3). **Done when:** a restore from a dump reproduces current data and the procedure is written down.

**3.3 Audit-log surface** — read-only audit view (create/void/edit with before/after + timestamp) in the UI (FR-A2, NFR-A1). **Done when:** every create/void/edit in a test session appears in the audit view.

**3.4 Hardening pass** — verify security headers (an observatory scan), `npm audit` clean, Dependabot/Renovate on, secrets confirmed out of the repo, no money/PII in the logging path, rate-limit/WAF rules set. **Done when:** the Security Blueprint checklist is fully green.

**3.5 Docs & handoff** — README (local setup, env/bindings, deploy, tests) + maintainer runbook (backup/restore, replay function, how to void/correct, incident basics); invite the maintainer to the private repo and the Cloudflare account with admin rights; confirm separate dev/prod (SRS §16). **Done when:** the maintainer can, from the runbook alone, deploy, run tests, take a backup, and restore it without the original developer.

### Later (only if requested — SRS §17 keeps these out)

Invoice-document generation, external exports/integrations, and reporting/analytics are **out of scope**. If tempted to add an item/HSN master, GST-rate master, advance allocation/FIFO, bulk import, or multi-user roles — stop: the consolidated balance and manual entry replace these by design.
