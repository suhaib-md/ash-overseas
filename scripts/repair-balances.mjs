// Repair stored running balances (and mis-dated reversals) in a D1 database.
//
//   node scripts/repair-balances.mjs            # DRY RUN against production
//   node scripts/repair-balances.mjs --apply    # actually write
//   node scripts/repair-balances.mjs --local    # target the local dev D1
//
// Why this exists: until 2026-08-17 a void stamped its reversing entry with the
// wall-clock time (`new Date()`) while every user entry is stamped at midnight of
// the chosen date. The reversal therefore sorted after every same-day entry, so it
// (a) sat at the top of the newest-first ledger and (b) owned the balance the
// dealer headline reads. Back-dated entries had the same effect. The code no longer
// does either, but rows written before the fix need repairing once.
//
// This is the `recomputeLedger` replay (SRS §13.2/§13.3) expressed as SQL:
// running_balance = cumulative SUM(debit - credit) in canonical (entry_date, id) order.
// It only ever rewrites `running_balance_paise` and reversal `entry_date`s — no
// financial amount is touched, and running it twice changes nothing.
import { spawnSync } from 'node:child_process';

const apply = process.argv.includes('--apply');
const local = process.argv.includes('--local');
const target = local
  ? { db: 'ash-overseas-dev', flags: '--local' }
  : { db: 'ash-overseas-prod', flags: '--remote --env production' };

// A reversal's own source_type is 'adjustment'; the source it reverses is named in
// its description ("Reversal of transaction #12" / "Reversal of movement #3").
const ORIGIN_TYPE = `CASE WHEN r.description LIKE 'Reversal of transaction #%' THEN 'transaction' ELSE 'movement' END`;
const ORIGIN_DATE = `SELECT MIN(o.entry_date) FROM ledger_entries o
     WHERE o.dealer_id = r.dealer_id AND o.account = r.account
       AND o.source_id = r.source_id AND o.source_type = ${ORIGIN_TYPE}`;

/** Cumulative (debit - credit) up to and including `le`, in (entry_date, id) order. */
const CORRECT_BALANCE = `SELECT COALESCE(SUM(x.debit_paise - x.credit_paise), 0)
     FROM ledger_entries x
     WHERE x.dealer_id = le.dealer_id AND x.account = le.account
       AND (x.entry_date < le.entry_date
            OR (x.entry_date = le.entry_date AND x.id <= le.id))`;

const REDATE = `UPDATE ledger_entries AS r SET entry_date = (${ORIGIN_DATE})
  WHERE r.source_type = 'adjustment' AND (${ORIGIN_DATE}) IS NOT NULL
    AND r.entry_date <> (${ORIGIN_DATE});`;

const REBALANCE = `UPDATE ledger_entries AS le
  SET running_balance_paise = (${CORRECT_BALANCE});`;

function run(sql, label) {
  const cmd = `npx wrangler d1 execute ${target.db} ${target.flags} --command "${sql.replace(/"/g, '\\"').replace(/\s+/g, ' ')}"`;
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) {
    console.error(`\n${label} failed:\n${r.stderr || r.stdout}`);
    process.exit(r.status ?? 1);
  }
  return r.stdout ?? '';
}

// --- report what is wrong ---------------------------------------------------

const misdated = run(
  `SELECT count(*) AS n FROM ledger_entries r WHERE r.source_type = 'adjustment'
     AND (${ORIGIN_DATE}) IS NOT NULL AND r.entry_date <> (${ORIGIN_DATE});`,
  'reversal-date check',
);
const wrong = run(
  `SELECT count(*) AS n FROM (SELECT le.running_balance_paise AS stored,
     (${CORRECT_BALANCE}) AS correct FROM ledger_entries le) WHERE stored <> correct;`,
  'balance check',
);
const num = (out) => Number((out.match(/"n":\s*(-?\d+)/) ?? [])[1] ?? 0);

console.log(`Target: ${target.db} ${local ? '(local)' : '(PRODUCTION)'}`);
console.log(`  mis-dated reversals : ${num(misdated)}`);
console.log(`  wrong balances      : ${num(wrong)}   (before re-dating)`);

if (!apply) {
  console.log('\nDry run — nothing written. Re-run with --apply to repair.');
  process.exit(0);
}

// --- repair -----------------------------------------------------------------
// Order matters: re-date first so the replay below sorts on the corrected dates.
console.log('\nRe-dating reversals to their original entry…');
run(REDATE, 'redate');
console.log('Replaying every dealer/account and rewriting running balances…');
run(REBALANCE, 'rebalance');

const left = run(
  `SELECT count(*) AS n FROM (SELECT le.running_balance_paise AS stored,
     (${CORRECT_BALANCE}) AS correct FROM ledger_entries le) WHERE stored <> correct;`,
  'verify',
);
console.log(`\n✅ Done. Remaining mismatches: ${num(left)} (must be 0).`);
process.exit(num(left) === 0 ? 0 : 1);
