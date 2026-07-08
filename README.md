# ASH Overseas — Trading Ledger

A private, single-user web app that replaces paper ledgers for ASH Overseas (metal castings &
scrap trading). It records goods transactions and money movements with dealers, keeping **two
parallel valuations** of every shipment and **one consolidated running balance** per dealer per
account.

- **Actual** = the real negotiated figures the business runs on.
- **Current** = the declared/invoiced figures used for GST.
- GST is computed on the **current** value but posts as real cash on the **actual** side.

Authoritative spec: [`SRS.md`](SRS.md). Engineering/security/UX rules and the phased build plan:
[`CLAUDE.md`](CLAUDE.md). Cloudflare provisioning + backups: [`SETUP.md`](SETUP.md). Visual system:
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

---

## Tech stack

Vite + React 19 SPA and a **Hono** API on one **Cloudflare Worker** (via `@cloudflare/vite-plugin`),
**D1** (SQLite) with **Drizzle**, **Zod** validation, **Tailwind v4**, **react-router**. Auth is
**Cloudflare Access** email-OTP + server-side JWT verification. All money is **integer paise**.

## Quick start

Prereqs: **Node ≥ 22.15** (24 recommended), **pnpm 10**, git. See [SETUP.md](SETUP.md) for the full
Cloudflare walkthrough.

```sh
pnpm install
pnpm db:migrate:local   # create tables in the local D1
pnpm dev                # http://localhost:5173
```

## Scripts

| Script                                     | What                                           |
| ------------------------------------------ | ---------------------------------------------- |
| `pnpm dev`                                 | Local dev server (Worker + SPA on miniflare)   |
| `pnpm build`                               | Production build (`dist/`)                     |
| `pnpm deploy`                              | Build + `wrangler deploy`                      |
| `pnpm test`                                | Pure unit tests (money + ledger engine)        |
| `pnpm test:d1`                             | D1-backed integration tests (Miniflare)        |
| `pnpm test:all`                            | Both suites                                    |
| `pnpm typecheck`                           | `tsc` across app/worker/node projects          |
| `pnpm lint` / `pnpm format`                | ESLint / Prettier                              |
| `pnpm db:generate`                         | Author a Drizzle migration from schema changes |
| `pnpm db:migrate:local` / `:dev` / `:prod` | Apply migrations                               |

## Architecture

```
shared/    Pure, DB-free logic shared by client + worker:
             money.ts (integer-paise math), format.ts, ledger.ts (posting engine),
             schemas.ts (Zod). This is where correctness lives — Section 6 tests exercise it.
worker/    Cloudflare Worker: index.ts (Hono routes + middleware), db/ (Drizzle schema+client),
             ledger/post.ts (atomic db.batch posting layer), repo/ (dealers, ledger, transactions,
             audit), auth.ts (Access JWT).
src/       React SPA: components/, features/ (DealerList, DealerDetail, forms, AuditLog), lib/api.ts.
migrations/  Drizzle-generated SQL (applied by wrangler).
```

The ledger is **append-only**: corrections post an equal-and-opposite **reversing entry** and flag
the source voided — nothing is hard-deleted. Every event's rows commit in a single atomic
`db.batch(...)`. Running balances are stored (read fast, recomputed by replay on demand).

## Testing

`pnpm test` runs the pure engine tests — the four SRS §6 acceptance scenarios reproduce exact
figures. `pnpm test:d1` runs the same through a real local D1 (Miniflare) plus the full HTTP API
(validation, CSRF, auth gate, void, GST split). CI (`.github/workflows/ci.yml`) runs
typecheck + both suites + build + `pnpm audit` on every push/PR.

## Security

- **Cloudflare Access** (email-OTP) gates the whole app at the edge; the Worker also verifies the
  `Cf-Access-Jwt-Assertion` JWT (`CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` secrets) so the raw
  `*.workers.dev` URL can't bypass it.
- Security headers (CSP `default-src 'self'`, HSTS, nosniff, `frame-ancestors 'none'`) via
  `public/_headers` (SPA) and `secureHeaders` (API).
- Zod at every boundary; integer-paise only; no money/PII in logs; parameterized queries.
- **Do not deploy to a reachable URL until Access is configured** (SETUP.md §7).

---

## Maintainer runbook

- **Deploy prod:** `wrangler deploy --env production` (after `pnpm db:migrate:prod`). First-time
  Cloudflare setup (D1, R2, Access) is in [SETUP.md](SETUP.md).
- **Run everything:** `pnpm test:all && pnpm typecheck && pnpm build`.
- **Backups/restore:** D1 Time Travel + `pnpm db:export` SQL dumps (card-free, no R2) — commands
  and the verified restore procedure are in [SETUP.md → Backups & restore](SETUP.md).
- **Correct a mistake (void):** open the dealer → the entry's ⃠ button → confirm. This posts a
  reversing entry and marks the source voided; the audit log records it. Never edit a posted
  ledger row directly.
- **Replay / verify balances:** `recomputeLedger(entries, account)` in `shared/ledger.ts` replays
  all entries in `(entry_date, id)` order — the source of truth if a stored balance is ever doubted.
- **Audit trail:** every create/void/edit is in the in-app **Audit log** (header icon → `/audit`)
  and the `audit_log` table.
- **Secrets** live only in `wrangler secret` / `.dev.vars` (gitignored) — never in the repo. Rotate
  on any suspicion.
- **Incident basics:** suspected bad data → restore via Time Travel to just before it; suspected
  key leak → rotate the D1 API token + Access, redeploy.
