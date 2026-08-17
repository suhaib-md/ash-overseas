/**
 * D1-backed integration tests for the posting layer — the SRS §6 scenarios must
 * also reproduce through a REAL local D1 (driven by Miniflare), writes must be
 * atomic, and balances must be read from stored values. Run with `pnpm test:d1`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { Miniflare } from 'miniflare';
import { migrate } from 'drizzle-orm/d1/migrator';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb, type Db } from '../db/client';
import {
  dealers,
  ledgerEntries,
  transactionLines,
  transactions,
  moneyMovements,
  auditLog,
} from '../db/schema';
import { postTransaction, postMovement, postOpening, voidSource } from './post';

const R = (rupees: number) => Math.round(rupees * 100);
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

let mf: Miniflare;
let d1: D1Database;
let db: Db;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } };',
    compatibilityDate: '2026-07-07',
    d1Databases: { DB: 'ash-test' },
  });
  d1 = (await mf.getD1Database('DB')) as unknown as D1Database;
  db = getDb(d1);
  await migrate(db, { migrationsFolder });
});

afterAll(async () => {
  await mf?.dispose();
});

beforeEach(async () => {
  // Fresh state per test (balances are per-dealer; human_id is a global sequence).
  await db.batch([
    db.delete(ledgerEntries),
    db.delete(transactionLines),
    db.delete(transactions),
    db.delete(moneyMovements),
    db.delete(auditLog),
    db.delete(dealers),
  ]);
  try {
    await d1.exec('DELETE FROM sqlite_sequence;');
  } catch {
    /* sqlite_sequence may not exist until the first autoincrement insert */
  }
});

async function makeDealer(name = 'Test Dealer'): Promise<number> {
  const rows = await db.insert(dealers).values({ name }).returning({ id: dealers.id });
  return rows[0]!.id;
}

async function storedBalance(dealerId: number, account: 'actual' | 'current'): Promise<number> {
  const rows = await db
    .select({ bal: ledgerEntries.runningBalancePaise })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.dealerId, dealerId), eq(ledgerEntries.account, account)))
    .orderBy(desc(ledgerEntries.entryDate), desc(ledgerEntries.id))
    .limit(1);
  return rows[0]?.bal ?? 0;
}

describe('posting layer against real D1', () => {
  it('Scenario A — money & goods both ways (actual balance −₹3,50,000)', async () => {
    const dealerId = await makeDealer();
    await postMovement(db, {
      dealerId,
      date: new Date('2026-05-01'),
      direction: 'received',
      amountPaise: R(600000),
      accountScope: 'actual',
    });
    await postTransaction(db, {
      dealerId,
      date: new Date('2026-05-02'),
      mode: 'sale',
      taxType: 'none',
      lines: [
        {
          itemName: 'Goods',
          quantity: 1,
          actualRatePaise: R(200000),
          currentRatePaise: R(200000),
          gstRatePercent: 0,
        },
      ],
    });
    await postTransaction(db, {
      dealerId,
      date: new Date('2026-05-03'),
      mode: 'purchase',
      taxType: 'none',
      lines: [
        {
          itemName: 'Scrap',
          quantity: 1,
          actualRatePaise: R(50000),
          currentRatePaise: R(50000),
          gstRatePercent: 0,
        },
      ],
    });
    const paid = await postMovement(db, {
      dealerId,
      date: new Date('2026-05-04'),
      direction: 'paid',
      amountPaise: R(100000),
      accountScope: 'actual',
    });

    expect(paid.balances.actual).toBe(-R(350000));
    expect(await storedBalance(dealerId, 'actual')).toBe(-R(350000));
  });

  it('Scenario B & C — advance + two GST sales (actual −₹1,17,502; invoices 2,69,323 / 2,19,952)', async () => {
    const dealerId = await makeDealer();

    // Advance is actual-only → must not touch the current account (Scenario C).
    await postMovement(db, {
      dealerId,
      date: new Date('2026-06-01'),
      direction: 'received',
      amountPaise: R(808867),
      accountScope: 'actual',
    });
    expect(await storedBalance(dealerId, 'current')).toBe(0);

    const s39 = await postTransaction(db, {
      dealerId,
      date: new Date('2026-06-02'),
      mode: 'sale',
      taxType: 'intra',
      referenceTag: 'ASH 39',
      lines: [
        {
          itemName: 'Castings',
          quantity: 9510,
          actualRatePaise: R(33),
          currentRatePaise: R(24),
          gstRatePercent: 18,
        },
      ],
    });
    expect(s39.actualBalancePaise).toBe(-R(453954));
    expect(s39.currentBalancePaise).toBe(R(269323)); // ASH 39 invoice total

    const s42 = await postTransaction(db, {
      dealerId,
      date: new Date('2026-06-03'),
      mode: 'sale',
      taxType: 'intra',
      referenceTag: 'ASH 42',
      lines: [
        {
          itemName: 'Castings',
          quantity: 11650,
          actualRatePaise: R(26),
          currentRatePaise: R(16),
          gstRatePercent: 18,
        },
      ],
    });
    expect(s42.actualBalancePaise).toBe(-R(117502));
    expect(s42.currentBalancePaise).toBe(R(269323) + R(219952));

    // Read from STORED running balance, not a recompute (NFR-P2).
    expect(await storedBalance(dealerId, 'actual')).toBe(-R(117502));

    // human_id is a per-mode-per-month sequence
    const txns = await db
      .select({ humanId: transactions.humanId })
      .from(transactions)
      .orderBy(transactions.id);
    expect(txns.map((t) => t.humanId)).toEqual(['SALE-2026-06-0001', 'SALE-2026-06-0002']);
  });

  it('Scenario D — a further ₹2,00,000 sale flips the balance across zero to +₹82,498', async () => {
    const dealerId = await makeDealer();
    await postMovement(db, {
      dealerId,
      date: new Date('2026-06-01'),
      direction: 'received',
      amountPaise: R(808867),
      accountScope: 'actual',
    });
    await postTransaction(db, {
      dealerId,
      date: new Date('2026-06-02'),
      mode: 'sale',
      taxType: 'intra',
      lines: [
        {
          itemName: 'C',
          quantity: 9510,
          actualRatePaise: R(33),
          currentRatePaise: R(24),
          gstRatePercent: 18,
        },
      ],
    });
    await postTransaction(db, {
      dealerId,
      date: new Date('2026-06-03'),
      mode: 'sale',
      taxType: 'intra',
      lines: [
        {
          itemName: 'C',
          quantity: 11650,
          actualRatePaise: R(26),
          currentRatePaise: R(16),
          gstRatePercent: 18,
        },
      ],
    });
    const flip = await postTransaction(db, {
      dealerId,
      date: new Date('2026-06-04'),
      mode: 'sale',
      taxType: 'none',
      lines: [
        {
          itemName: 'C',
          quantity: 1,
          actualRatePaise: R(200000),
          currentRatePaise: R(200000),
          gstRatePercent: 0,
        },
      ],
    });
    expect(flip.actualBalancePaise).toBe(R(82498));
  });

  it('a failed batch leaves NO partial rows (atomicity)', async () => {
    const dealerId = await makeDealer();
    // Second statement violates NOT NULL (missing runningBalancePaise) → whole batch rolls back.
    await expect(
      db.batch([
        db.insert(transactions).values({
          id: 999,
          humanId: 'SALE-2026-06-9999',
          mode: 'sale',
          dealerId,
          date: new Date(),
          taxType: 'none',
        }),
        db.insert(ledgerEntries).values({
          dealerId,
          account: 'actual',
          entryDate: new Date(),
          sourceType: 'transaction',
          sourceId: 999,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ]),
    ).rejects.toThrow();

    const rows = await db.select().from(transactions).where(eq(transactions.id, 999));
    expect(rows.length).toBe(0);
  });

  it('voiding a movement appends a reversal and moves the stored balance back to zero (no hard delete)', async () => {
    const dealerId = await makeDealer();
    const m = await postMovement(db, {
      dealerId,
      date: new Date('2026-06-10'),
      direction: 'received',
      amountPaise: R(100000),
      accountScope: 'actual',
    });
    expect(await storedBalance(dealerId, 'actual')).toBe(-R(100000));

    const res = await voidSource(db, {
      sourceType: 'movement',
      sourceId: m.movementId,
      entryDate: new Date('2026-06-11'),
    });
    expect(res.reversalCount).toBe(1);
    expect(await storedBalance(dealerId, 'actual')).toBe(0);

    const mv = await db.select().from(moneyMovements).where(eq(moneyMovements.id, m.movementId));
    expect(mv[0]!.isVoided).toBe(true); // original retained, just flagged
  });

  it('postOpening seeds a signed opening balance', async () => {
    const dealerId = await makeDealer();
    const o = await postOpening(db, {
      dealerId,
      account: 'actual',
      signedBalancePaise: -R(50000),
      date: new Date('2026-04-01'),
    });
    expect(o.balancePaise).toBe(-R(50000));
    expect(await storedBalance(dealerId, 'actual')).toBe(-R(50000));
  });
});

// Regression: reported from production 2026-08-17. A void stamped the reversal with
// `new Date()` while user entries are stamped at midnight of the chosen date, so the
// reversal sorted after every same-day entry. That (a) pinned it to the top of the
// newest-first ledger and (b) made the headline balance read the reversal's stale
// running balance instead of the genuinely-latest entry. SRS §10.7 + §13.3.
describe('void ordering & balance repair', () => {
  const DAY = new Date('2026-08-17');

  async function purchase(dealerId: number, rupees: number, date = DAY): Promise<number> {
    const r = await postTransaction(db, {
      dealerId,
      date,
      mode: 'purchase',
      taxType: 'none',
      lines: [
        {
          itemName: 'slag',
          quantity: 1,
          actualRatePaise: R(rupees),
          currentRatePaise: R(rupees),
          gstRatePercent: 0,
        },
      ],
    });
    return r.transactionId;
  }

  it('a transaction entered AFTER a same-day void continues from the reversed balance', async () => {
    const dealerId = await makeDealer();
    const first = await purchase(dealerId, 7890); // actual −7,890
    await postMovement(db, {
      dealerId,
      date: DAY,
      direction: 'paid',
      amountPaise: R(10000),
      accountScope: 'actual',
    }); // → +2,110

    // Void WITHOUT an explicit entryDate — this is what the API route does.
    await voidSource(db, { sourceType: 'transaction', sourceId: first });
    expect(await storedBalance(dealerId, 'actual')).toBe(R(10000));

    await purchase(dealerId, 1278); // → 10,000 − 1,278 = 8,722
    expect(await storedBalance(dealerId, 'actual')).toBe(R(8722));

    // …and the reversal must NOT be the newest entry any more.
    const ordered = await db
      .select({ sourceType: ledgerEntries.sourceType, bal: ledgerEntries.runningBalancePaise })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.dealerId, dealerId), eq(ledgerEntries.account, 'actual')))
      .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id));
    expect(ordered.at(-1)!.sourceType).toBe('transaction');
    expect(ordered.at(-1)!.bal).toBe(R(8722));
  });

  it('voiding an older entry repairs the running balance of every later entry', async () => {
    const dealerId = await makeDealer();
    const old = await purchase(dealerId, 5000, new Date('2026-08-01')); // −5,000
    await purchase(dealerId, 1000, new Date('2026-08-10')); // −6,000
    await postMovement(db, {
      dealerId,
      date: new Date('2026-08-15'),
      direction: 'paid',
      amountPaise: R(2000),
      accountScope: 'actual',
    }); // −4,000
    expect(await storedBalance(dealerId, 'actual')).toBe(-R(4000));

    await voidSource(db, { sourceType: 'transaction', sourceId: old });

    // Reversing a 5,000 purchase lifts every later balance by 5,000.
    const ordered = await db
      .select({ bal: ledgerEntries.runningBalancePaise })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.dealerId, dealerId), eq(ledgerEntries.account, 'actual')))
      .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id));
    expect(ordered.map((r) => r.bal)).toEqual([-R(5000), 0, -R(1000), R(1000)]);
    expect(await storedBalance(dealerId, 'actual')).toBe(R(1000));
  });
});

// Sibling of the void bug: an entry dated in the past also lands mid-ledger, so every
// later entry's stored balance was computed without it.
describe('back-dated entries', () => {
  it('a back-dated transaction repairs the balances of entries that follow it', async () => {
    const dealerId = await makeDealer();
    await postMovement(db, {
      dealerId,
      date: new Date('2026-08-20'),
      direction: 'paid',
      amountPaise: R(5000),
      accountScope: 'actual',
    }); // +5,000

    // Owner enters a deal from last week, after already recording the newer payment.
    await postTransaction(db, {
      dealerId,
      date: new Date('2026-08-10'),
      mode: 'purchase',
      taxType: 'none',
      lines: [
        {
          itemName: 'slag',
          quantity: 1,
          actualRatePaise: R(2000),
          currentRatePaise: R(2000),
          gstRatePercent: 0,
        },
      ],
    }); // −2,000, dated BEFORE the payment

    // True order: purchase (−2,000) then payment (+3,000).
    const ordered = await db
      .select({ bal: ledgerEntries.runningBalancePaise })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.dealerId, dealerId), eq(ledgerEntries.account, 'actual')))
      .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id));
    expect(ordered.map((r) => r.bal)).toEqual([-R(2000), R(3000)]);
    expect(await storedBalance(dealerId, 'actual')).toBe(R(3000));
  });
});
