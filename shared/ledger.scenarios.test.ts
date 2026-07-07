/**
 * SRS §6 — Worked Scenarios (the gating acceptance tests for the ledger engine).
 * Every figure below is copied from the SRS and must reproduce exactly.
 */
import { describe, it, expect } from 'vitest';
import {
  type Account,
  type Posting,
  transactionPostings,
  movementPostings,
  computeTransaction,
  applyToBalance,
  describeBalance,
} from './ledger';

/** Rupees → integer paise, for readable expectations. */
const R = (rupees: number) => Math.round(rupees * 100);

/** Apply the postings for one account to a running balance. */
function apply(balance: number, account: Account, postings: Posting[]): number {
  return postings
    .filter((p) => p.account === account)
    .reduce((b, p) => applyToBalance(b, p), balance);
}

/** A no-GST goods movement whose posted total is exactly `amountPaise`. */
const goods = (mode: 'sale' | 'purchase', amountPaise: number) =>
  transactionPostings({
    mode,
    taxType: 'none',
    lines: [
      {
        quantity: 1,
        actualRatePaise: amountPaise,
        currentRatePaise: amountPaise,
        gstRatePercent: 0,
      },
    ],
  }).postings;

// The two shipments used across Scenarios B & C.
const ash39 = {
  mode: 'sale',
  taxType: 'intra',
  lines: [{ quantity: 9510, actualRatePaise: R(33), currentRatePaise: R(24), gstRatePercent: 18 }],
} as const;
const ash42 = {
  mode: 'sale',
  taxType: 'intra',
  lines: [{ quantity: 11650, actualRatePaise: R(26), currentRatePaise: R(16), gstRatePercent: 18 }],
} as const;

describe('SRS §6 acceptance scenarios', () => {
  it('Scenario A — money and goods both ways on the actual account', () => {
    let bal = 0;
    // 1. Dealer gives the business ₹6,00,000
    bal = apply(
      bal,
      'actual',
      movementPostings({ direction: 'received', amountPaise: R(600000), accountScope: 'actual' }),
    );
    expect(bal).toBe(-R(600000));
    // 2. Business sends goods worth ₹2,00,000
    bal = apply(bal, 'actual', goods('sale', R(200000)));
    expect(bal).toBe(-R(400000));
    // 3. Business receives goods worth ₹50,000
    bal = apply(bal, 'actual', goods('purchase', R(50000)));
    expect(bal).toBe(-R(450000));
    // 4. Business pays dealer ₹1,00,000
    bal = apply(
      bal,
      'actual',
      movementPostings({ direction: 'paid', amountPaise: R(100000), accountScope: 'actual' }),
    );
    expect(bal).toBe(-R(350000));
    expect(describeBalance(bal)).toEqual({ state: 'you_owe', magnitudePaise: R(350000) });
  });

  it('Scenario B — advance then two GST sales, actual account, ends at −₹1,17,502', () => {
    let bal = 0;
    // 1. Advance received (cash → actual only)
    bal = apply(
      bal,
      'actual',
      movementPostings({ direction: 'received', amountPaise: R(808867), accountScope: 'actual' }),
    );
    expect(bal).toBe(-R(808867));

    // 2. Sale ASH 39 → actual debit 3,54,913 (goods 3,13,830 + GST 41,083.20, rounded)
    const s39 = transactionPostings(ash39);
    expect(s39.computed.actualGoodsPaise).toBe(R(313830));
    expect(s39.computed.totalGstPaise).toBe(4108320); // ₹41,083.20
    expect(s39.computed.actualPostedPaise).toBe(R(354913));
    expect(s39.computed.actualRoundOffPaise).toBe(-20);
    bal = apply(bal, 'actual', s39.postings);
    expect(bal).toBe(-R(453954));

    // 3. Sale ASH 42 → actual debit 3,36,452 (goods 3,02,900 + GST 33,552)
    const s42 = transactionPostings(ash42);
    expect(s42.computed.actualGoodsPaise).toBe(R(302900));
    expect(s42.computed.totalGstPaise).toBe(R(33552));
    expect(s42.computed.actualPostedPaise).toBe(R(336452));
    bal = apply(bal, 'actual', s42.postings);

    expect(bal).toBe(-R(117502));
    expect(describeBalance(bal)).toEqual({ state: 'you_owe', magnitudePaise: R(117502) });
  });

  it('Scenario C — the same two shipments on the current account', () => {
    const c39 = computeTransaction(ash39);
    expect(c39.currentGoodsPaise).toBe(R(228240)); // 9,510 × ₹24
    expect(c39.totalGstPaise).toBe(4108320);
    expect(c39.currentPostedPaise).toBe(R(269323)); // invoice total
    expect(c39.currentRoundOffPaise).toBe(-20); // ₹2,69,323.20 → ₹2,69,323.00

    const c42 = computeTransaction(ash42);
    expect(c42.currentGoodsPaise).toBe(R(186400)); // 11,650 × ₹16
    expect(c42.currentPostedPaise).toBe(R(219952));
    expect(c42.currentRoundOffPaise).toBe(0);

    // The advance was actual-only → it must NOT touch the current account.
    const advance = movementPostings({
      direction: 'received',
      amountPaise: R(808867),
      accountScope: 'actual',
    });
    expect(advance.some((p) => p.account === 'current')).toBe(false);
  });

  it('Scenario D — a further ₹2,00,000 sale flips the balance across zero to +₹82,498', () => {
    let bal = -R(117502); // end of Scenario B
    const extra = goods('sale', R(200000)); // actual + GST already = ₹2,00,000
    bal = apply(bal, 'actual', extra);
    expect(bal).toBe(R(82498));
    expect(describeBalance(bal)).toEqual({ state: 'owes_you', magnitudePaise: R(82498) });
  });
});
