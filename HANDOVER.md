# Handover Guide — ASH Overseas Trading Ledger

**Who this is for:** the new maintainer (the person taking over the technical side), and the
business owner who uses the app every day.

You do **not** need to have built this app to run it. This guide assumes you know a little
programming but nothing about this project. Read Part 1 and Part 2 once, then use the rest as a
reference when you need it.

If anything here disagrees with the code, the code wins — tell someone so this file gets fixed.

**Other documents, and when to open them:**

| File               | What it's for                                       |
| ------------------ | --------------------------------------------------- |
| `README.md`        | Short technical overview + script list              |
| `SETUP.md`         | First-time Cloudflare setup, backup/restore detail  |
| `GO-LIVE.md`       | One-time production provisioning steps              |
| `SRS.md`           | The full spec. **The final word on business rules** |
| `CLAUDE.md`        | Engineering, security and design rules              |
| `DESIGN_SYSTEM.md` | Colours, fonts, spacing                             |

---

## Part 0 — What this app actually does

ASH Overseas trades metal castings and scrap. This app replaces a paper ledger.

There are **three ideas**. If you understand these, everything else makes sense.

### Idea 1 — Every shipment is recorded at two prices

Every batch of goods gets written down **twice, at the same time**:

- **Actual** — the real price that was really negotiated. This is what the business actually runs on.
- **Current** — the declared/invoiced price used for GST and official paperwork.

These are **the same physical goods**, not two different deals. Think of it as one shipment seen
through two lenses. The app shows them as two tabs on the dealer's page.

GST is always calculated on the **Current** price. But the GST money is real money that really
changes hands, so it is added to the **Actual** side as cash. That trips people up — it is correct
and deliberate.

### Idea 2 — Each dealer has ONE balance per side

Not one balance for purchases and another for sales. **One number.** If a dealer both buys from you
and sells to you, it all nets into a single figure.

### Idea 3 — Plus means they owe you

Everything is written from the business's point of view:

| Balance  | The app says         | Meaning                          |
| -------- | -------------------- | -------------------------------- |
| Positive | "Dealer owes you ₹X" | They owe money (receivable)      |
| Negative | "You owe dealer ₹X"  | The business owes them (payable) |
| Zero     | "Settled"            | All square                       |

The owner never sees a plus or minus sign — only these words. Keep it that way.

### One more thing: money is stored in paise

₹1 = 100 paise. Every amount in the database is a whole number of paise (₹2,69,323 is stored as
`26932300`). This avoids the rounding errors you get with decimals. You only convert to rupees when
showing it on screen.

> **If you ever find yourself writing `parseFloat`, `toFixed`, or storing money as a decimal —
> stop.** That is a bug in a financial ledger, not a style preference.

---

## Part 1 — Access you need to be given

Ask the current owner to set these up. Tick them off as they arrive.

- [ ] **GitHub repository** — `github.com/suhaib-md/ash-overseas`. You'll get an email invite.
      _Write_ access lets you push code; _Admin_ additionally lets you manage repository secrets.
- [ ] **Cloudflare account** — invited as an **Administrator**. Accept the emailed invite. This is
      where the app runs and where the database lives.
- [ ] **The app login** — see the warning below before asking for this.

> ### ⚠️ Important: this app has only ONE login
>
> By design there is exactly **one** username and password for the whole app (stored as a single
> row in the `app_credentials` table). There is no "add a second user" feature, and adding one is
> explicitly out of scope.
>
> Two consequences:
>
> 1. **The audit log cannot tell people apart.** It records _what_ changed and _when_, but there is
>    no "who" column. If two people share the login, you can never prove who voided an entry.
> 2. **Whoever changes the password locks the other person out**, because there is only one.
>
> **If you are only maintaining the software** — deploying, fixing bugs, taking backups — you do
> **not** need the app login. GitHub + Cloudflare is enough. Only ask for the login if you will
> personally be entering transactions.
>
> Never send the password over WhatsApp or email. Say it out loud, or use a password manager.

---

## Part 2 — Setting up your computer

You need **Node.js 22.15 or newer** (24 is recommended), **pnpm 10**, and **git**.

```sh
git clone https://github.com/suhaib-md/ash-overseas.git
cd ash-overseas
pnpm install
```

Log in to Cloudflare from your terminal (opens a browser window):

```sh
npx wrangler login
npx wrangler whoami     # should print the ASH Overseas account
```

Set up a local database on your own machine and start the app:

```sh
pnpm db:migrate:local   # creates the tables locally
pnpm dev                # opens http://localhost:5173
```

This local copy is **completely separate** from the real one. Nothing you do here touches real
business data. Experiment freely — this is where you should try everything before touching
production.

By default the local copy has **no login screen** (that's intentional, so development is quick).
If you want to test the login flow locally:

1. Create a file called `.dev.vars` in the project folder.
2. Put one line in it: `AUTH_SECRET="anything-you-like"`
3. Run `node scripts/setup-login.mjs --local` and set a test username/password.
4. Restart `pnpm dev`.

`.dev.vars` is gitignored, so it can never be committed by accident.

### Check everything works

```sh
pnpm test:all     # 65 tests should pass
pnpm typecheck    # no output = good
pnpm build        # should finish without errors
```

If all three pass, your setup is correct.

---

## Part 3 — Operations runbook

This is the part to bookmark. Each task is a recipe.

### 3.1 The map: where things live

```
shared/    The important logic, with no database code in it:
             money.ts    — all money arithmetic (rounding, GST)
             ledger.ts   — the posting engine: given an event, what entries to write
             format.ts   — turning paise into "₹1,23,456.78"
             schemas.ts  — Zod input validation
worker/    The server (a Cloudflare Worker):
             index.ts        — all the API routes
             auth.ts         — password hashing + login cookie
             ledger/post.ts  — writes ledger rows to the database, atomically
             db/schema.ts    — the database table definitions
             repo/           — database queries
src/       The website the user sees (React):
             features/       — the actual screens
             components/     — reusable pieces
migrations/  Database change files
```

**The most important idea:** the maths lives in `shared/` and has no database code at all. That's
what makes it easy to test. The tests in `shared/ledger.scenarios.test.ts` are four real-world
scenarios from the spec with exact expected rupee figures. **If you change anything about how money
works, those tests must still pass.** They are the safety net.

### 3.2 Running tests

```sh
pnpm test        # fast: the money + ledger maths (43 tests)
pnpm test:d1     # slower: runs against a real local database (22 tests)
pnpm test:all    # both — run this before every deploy
```

### 3.3 Deploying a change to production

**Always run the tests first.** Then:

```sh
pnpm test:all
pnpm deploy:prod
```

> ### ⚠️ Never run `wrangler deploy --env production`
>
> It looks like it should work. It does not. The build tool decides which database to connect to at
> **build** time, so that command would put your new code live but pointed at the **development
> database** — the app would appear to lose all its data.
>
> **Always `pnpm deploy:prod`.** It builds correctly first, then deploys.

If you changed anything in `worker/db/schema.ts`, you must also update the real database first:

```sh
pnpm db:generate        # writes a new migration file into migrations/
pnpm db:migrate:local   # test it on your machine first
pnpm test:all           # make sure nothing broke
pnpm db:migrate:prod    # THEN apply to the real database
pnpm deploy:prod
```

> Never edit a migration file that has already been applied. Always add a new one.

### 3.4 Backups

There are two independent safety nets.

**Net 1 — Time Travel.** Cloudflare automatically keeps the last **30 days** of the database. You
don't set this up; it's always on. To rewind the database to a moment in the past:

```sh
npx wrangler d1 time-travel restore ash-overseas-prod --env production --timestamp="2026-08-15T09:00:00Z"
```

**Net 2 — SQL dumps.** A full text export of everything:

```sh
pnpm db:export          # writes backup.sql in the project folder
```

There is also an automatic weekly backup (GitHub → **Actions** → **Backup (D1 export)**). It saves
the file as a downloadable "artifact" on the workflow run.

> ### ⚠️ Two things to know about the automatic backup
>
> 1. **Artifacts are deleted after 90 days.** There is no long-term archive. Download one every few
>    months and keep it somewhere safe (Google Drive, external drive).
> 2. **A green tick does not mean a backup happened.** If the `CLOUDFLARE_API_TOKEN` secret is
>    missing, the job skips the export and still passes. Always check that the run actually produced
>    an artifact — if the Artifacts box shows `–`, nothing was saved.

`backup.sql` contains real financial data. It is gitignored. Never commit it, never email it.

### 3.5 Restoring from a backup (practise this before you need it)

Never restore into the live database as a test. Restore into a **scratch** database:

```sh
pnpm db:export                                    # get a fresh dump
npx wrangler d1 create ash-overseas-restore-check # make a temporary database
npx wrangler d1 execute ash-overseas-restore-check --remote --file backup.sql
npx wrangler d1 execute ash-overseas-restore-check --remote --command "SELECT count(*) FROM dealers;"
npx wrangler d1 delete ash-overseas-restore-check # clean up
```

If the dealer count matches what's in the live app, your backup is good.

**Do this once yourself.** Don't take anyone's word that backups work.

### 3.6 Changing the login

In the app: header → account icon → **Account** → change username or password. Both require the
current password.

If the password is lost entirely, reset it from the command line:

```sh
node scripts/setup-login.mjs
```

It asks for a username and password and writes them to the production database. Answer **n** when
it offers to rotate `AUTH_SECRET` unless you actually need to (see below).

### 3.7 If you suspect a security problem

1. Change the password immediately (Account screen, or the script above).
2. Rotate the cookie key — run `node scripts/setup-login.mjs` and answer **y** to the `AUTH_SECRET`
   question. This **logs out every device instantly**.
3. Check the **Audit log** in the app for anything unexpected.
4. If data was tampered with, use Time Travel (3.4) to rewind to before it happened.
5. If the Cloudflare API token may have leaked, delete it in the Cloudflare dashboard and create a
   new one, then update the GitHub secret.

### 3.8 Secrets — where they live

Nothing sensitive is ever stored in the repository.

| Secret                  | Where it lives              | Can you read it?          |
| ----------------------- | --------------------------- | ------------------------- |
| `AUTH_SECRET`           | Cloudflare Worker secret    | No — only replace it      |
| `CLOUDFLARE_API_TOKEN`  | GitHub repository secret    | No — only replace it      |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub repository secret    | No — only replace it      |
| Local dev secrets       | `.dev.vars` on your machine | Yes — but never commit it |

`AUTH_SECRET` is what switches the login on. **If it were ever removed, the app would become
completely open to the internet.** Never delete it from production.

---

## Part 4 — Using the app: every feature, step by step

**This part is for the business owner.** Print it, or read it together on the phone.

The app works on a phone, a tablet or a computer. On a phone the menu is a row of icons along the
bottom; on a computer it's a list down the left. Everything else is the same.

### 4.1 Signing in

1. Open the app link in the browser.
2. Type the username and password.
3. Tap **Sign in**.

You stay signed in for **30 days**, so you won't have to do this often. If you type the password
wrong, it waits about half a second before saying so — that's deliberate, to stop guessing.

To sign out, tap the **log-out icon** in the top-right corner.

### 4.2 The Home screen

Two big buttons — **Purchase** and **Sale** — and a list of dealers underneath showing what each one
owes, or is owed.

- Tap **Purchase** to see only dealers you buy from.
- Tap **Sale** to see only dealers you sell to.
- Tap **Dealers** in the menu to see everyone.

### 4.3 Adding a new dealer

1. Go to **Dealers** (or Purchase / Sale).
2. Tap **+ New dealer**.
3. Fill in:
   - **Name** — required. Everything else is optional.
   - **Type** — Both, Supplier, or Buyer. This only decides which lists they appear in. **It does
     not split their balance.**
   - **GSTIN** — their GST number, if you have it.
   - **State code** — e.g. `33` for Tamil Nadu. Used to work out whether GST is CGST+SGST or IGST.
   - **Opening actual balance** — only if this dealer already owes you (or you owe them) from
     before you started using the app. Type a **positive** number if they owe you, a **negative**
     number if you owe them. Leave blank if starting fresh.
4. Tap **Create dealer**.

### 4.4 Finding a dealer

On any dealer list, use the **Search dealers…** box at the top. Start typing the name.

### 4.5 The dealer's page — reading the balance

Tap a dealer's name. At the top you'll see the balance in plain words:

> **"Dealer owes you ₹1,23,456.78"** or **"You owe dealer ₹1,23,456.78"** or **"Settled"**

Below that are two tabs: **Actual** and **Current**.

- **Actual** — the real figures.
- **Current** — the invoiced/declared figures.

Remember: **these are the same goods**, shown two ways. Not two separate sets of deals.

Underneath is the full history, newest first, each line showing the running balance after it.

### 4.6 Recording a purchase or a sale

From the dealer's page, tap **Add transaction**.

1. **Mode** — Sale (goods going to the dealer) or Purchase (goods coming from them).
2. **Tax** — choose one:
   - **Intra (CGST+SGST)** — dealer is in the same state (Tamil Nadu).
   - **Inter (IGST)** — dealer is in a different state.
   - **None** — no GST.
3. **Date** — defaults to today. You cannot pick a future date.
4. **The line items** — one row per material. For each:
   - **Item name** — free text, e.g. "brass scrap". Past entries are suggested as you type, but you
     can type anything.
   - **Qty** — the quantity.
   - **Unit** — e.g. kg, ton, nos. Also suggested from past entries.
   - **Actual rate** — the real price per unit.
   - **Current rate** — the invoiced price per unit. Type it in freely; it is **not** calculated
     from the actual rate.
   - **GST %** — e.g. 18.

   Tap **+ Add line** for more materials. Tap the bin icon to remove one.

5. **Reference tag** — your own label, e.g. `ASH 39`. This is how you'll recognise the deal later.
6. **More options** (tap to expand) — all optional:
   - **Invoice no.** and **Invoice date**
   - **Discount** and **Freight**
   - **Credit / debit note** — tick this if the entry should post in the _opposite_ direction to
     normal. Leave unticked for ordinary deals.
   - **Notes**
7. **Check the summary box** at the bottom. As you type it shows live:
   - Actual total
   - Current / invoice total
   - GST (shown as CGST + SGST, or IGST)
   - Round-off, if any
8. Tap **Save sale** / **Save purchase**.

> **The summary is there so there are no surprises.** Read it before saving. If a number looks
> wrong, it _is_ wrong — fix it before saving, because correcting it afterwards means voiding.

**Half-finished entries are saved automatically.** If your phone loses signal or you tap Back by
accident, your typing is still there when you come back.

### 4.7 Recording money received or paid

From the dealer's page, tap **Add money**.

1. **Direction** — "Received from dealer" or "Paid to dealer".
2. **Date** — defaults to today.
3. **Amount**.
4. **Applies to** — this one matters:
   - **Actual only** — the usual choice. Cash advances and informal payments.
   - **Current only** — rare.
   - **Both** — for official bank payments against an invoice, which should show on both sides.

   If unsure, choose **Actual only** — that's the default and the common case.

5. **Method** — Cash, Bank, Cheque, or UPI. Optional.
6. **Reference** and **Notes** — optional.
7. Tap **Save money movement**.

### 4.8 Seeing the details of a past deal

On the dealer's page, tap any entry in the history. It opens the full record: every line item, both
rates, the GST breakdown, and any invoice details.

### 4.9 Fixing a mistake (voiding)

**Nothing is ever deleted from this ledger.** That's what makes it trustworthy. To fix an error you
"void" it: the app adds an equal and opposite entry that cancels it out, and both stay visible.

1. Find the wrong entry on the dealer's page.
2. Tap the **void** button on that row.
3. Confirm.

Afterwards the original shows **struck through** with a "Voided" tag, and the cancelling entry sits
next to it. The balance goes back to what it was. Then just enter the correct version fresh.

> Voiding is normal and safe. Don't be nervous about it. What you must never do is ask someone to
> "just delete it from the database" — that breaks the whole record.

### 4.10 The audit log

Header → the **scroll icon** → shows every create, edit and void, with what changed and when.

This is a read-only record. It's what you check if a number ever looks wrong.

### 4.11 The Account screen

Header → the **account icon**.

- **Change username** — needs your current password.
- **Change password** — needs your current password.
- **Log out**.

### 4.12 Installing it like a real app

In the phone's browser menu, choose **"Add to Home screen"**. You get an icon that opens without
the browser bar around it.

It needs an internet connection to work. It deliberately does **not** store balances on the phone —
showing an out-of-date balance would be worse than showing nothing.

---

## Part 5 — Testing the app together

Do this once with the owner, on a phone, ideally in the **local** copy (Part 2) so no real data is
created. It takes about 15 minutes and proves everything works.

**Setup**

1. Sign in.

**Dealers**

2. Create a dealer called "Test Dealer", type **Both**, state code `33`, opening balance blank.
3. Check they appear in the **Dealers** list with a balance of "Settled".
4. Search for "Test" — they should appear.

**Money in**

5. Open them → **Add money** → Received from dealer → ₹1,00,000 → Applies to **Actual only** → Save.
6. The headline should now read **"You owe dealer ₹1,00,000.00"** (they've paid you in advance, so
   you owe them goods).
7. Switch to the **Current** tab — the advance should **not** appear there, because it was Actual
   only. This surprises people; it is correct.

**A sale**

8. **Add transaction** → Mode **Sale**, Tax **Intra (CGST+SGST)**, one line: item "brass scrap",
   qty `10`, unit `kg`, actual rate `₹1,000`, current rate `₹900`, GST `18`.
9. Before saving, check the summary box shows **exactly** this:
   - **Actual total ₹11,620.00** — that's ₹10,000 of goods **plus** the ₹1,620 GST
   - **Current / invoice total ₹10,620.00** — ₹9,000 of goods plus the same ₹1,620 GST
   - **CGST + SGST ₹1,620.00** — 18% of the ₹9,000 _current_ value, not the actual value
   - No round-off line (these are whole rupees)

   > If the totals look "too big", this is the dual-valuation rule doing its job: GST is worked out
   > on the Current price but is real cash, so it's added to **both** totals. See Part 0, Idea 1.

10. Save. The headline should now read **"You owe dealer ₹88,380.00"**
    (₹1,00,000 advance − ₹11,620 of goods). Check the **Current** tab too — it should show only the
    sale, since the advance was Actual-only.

**Fixing a mistake**

11. Void the sale you just made. Confirm.
12. The sale should now be struck through with a "Voided" tag, the reversing entry visible next to
    it, and the balance back to **"You owe dealer ₹1,00,000.00"**.

**The record**

13. Open the **Audit log** — the create and the void should both be listed.

**Account**

14. Change the password to something else, then change it back. Log out and back in.

If every step behaves as described, the app is working correctly.

---

## Part 6 — Rules that must never be broken

These aren't style preferences. Each one is silent and damaging if broken.

1. **Never delete or edit a ledger row directly in the database.** Corrections are voids. The
   append-only history is the whole point of the system.
2. **Never use `wrangler deploy --env production`.** Always `pnpm deploy:prod`. (See 3.3.)
3. **Never use decimals for money.** Integer paise everywhere. No `parseFloat`, no `toFixed`.
4. **Never commit `.dev.vars` or `backup.sql`.** Both are gitignored. One holds secrets, the other
   holds real financial data.
5. **Never remove `AUTH_SECRET` from production.** Without it the login switches off and the app is
   open to anyone.
6. **Never do money arithmetic outside `shared/money.ts`.** One module owns all of it, so rounding
   behaves consistently.
7. **Run `pnpm test:all` before every deploy.** The four scenario tests are the safety net.

### Things that are deliberately NOT in this app

Don't add these, and don't accept a request to add them without re-reading `SRS.md` first. They were
excluded on purpose:

item/material/HSN master · GST rate master · advance allocation or FIFO matching · accounting
software integration · legal invoice or tax return generation · bulk import · analytics or ageing
dashboards · multiple users or roles.

---

## Part 7 — Troubleshooting

**"The app shows a login page and my password doesn't work."**
Check the credentials row exists:
`npx wrangler d1 execute ash-overseas-prod --remote --env production --command "SELECT username FROM app_credentials;"`
If it returns nothing, run `node scripts/setup-login.mjs`.

**"The app loads but all the data is gone."**
Most likely something was deployed with `wrangler deploy --env production`, so the live app is
pointed at the development database. Redeploy properly with `pnpm deploy:prod`. The data is not
lost.

**"GitHub Actions is failing with `ERR_PNPM_BAD_PM_VERSION`."**
The pnpm version is declared twice. Keep `packageManager` in `package.json` and remove `version:`
from the workflow file.

**"CI fails on `pnpm audit`."**
A dependency has a new high-severity advisory. Run `pnpm audit --audit-level=high --prod` locally,
update the package, run `pnpm test:all`, then push.

**"A balance looks wrong."**
Open the Audit log first. The stored balance can be re-derived from scratch: `recomputeLedger()` in
`shared/ledger.ts` replays every non-voided entry in `(entry_date, id)` order. That replay is the
source of truth if a stored figure is ever doubted.

**"Wrangler prints `✨ Success!` then seems to freeze on Windows."**
Known quirk. It already worked. Press Ctrl-C.

---

## Part 8 — Known gaps

Honest list of things that don't exist yet, so you don't go hunting for buttons that aren't there.

- **No edit-dealer or archive-dealer screen.** The server supports both
  (`PATCH /api/dealers/:id` and `POST /api/dealers/:id/archive`) but nothing in the app calls them.
  Changing a dealer's name currently needs a manual API call. This is the most obvious thing to
  build next.
- **The audit log has no "who" column.** Fine while one person uses it; a real limitation if the
  login is shared. See the warning in Part 1.
- **Backup artifacts expire after 90 days** and there is no long-term archive. Download one
  periodically.
- **No rate limiting on the login.** The half-second delay on a wrong password is the only
  protection. Proper rate limiting needs a custom domain, which the business chose not to buy.
- **Some development-only dependencies have open advisories.** They don't ship to the live server.
  Dependabot opens update pull requests weekly.

---

## Quick reference

```sh
pnpm dev                 # run locally
pnpm test:all            # all 65 tests
pnpm typecheck           # type errors
pnpm deploy:prod         # deploy to production  ← the only correct deploy command
pnpm db:migrate:local    # apply schema changes locally
pnpm db:migrate:prod     # apply schema changes to production
pnpm db:export           # download a full backup
node scripts/setup-login.mjs   # reset the app username/password
npx wrangler whoami      # check which Cloudflare account you're on
```

**In an emergency:** take a backup first (`pnpm db:export`), then fix. A backup costs seconds; a
bad restore costs the ledger.
