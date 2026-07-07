import { describe, it, expect } from 'vitest';
import {
  transactionPostings,
  computeTransaction,
  movementPostings,
  openingPosting,
  reversePosting,
  applyToBalance,
  recomputeLedger,
  balanceOf,
  describeBalance,
  type ReplayEntry,
} from './ledger';

const R = (rupees: number) => Math.round(rupees * 100);

describe('transactionPostings — direction', () => {
  const line = {
    quantity: 1,
    actualRatePaise: R(1000),
    currentRatePaise: R(800),
    gstRatePercent: 0,
  };

  it('a sale debits both accounts', () => {
    const { postings } = transactionPostings({ mode: 'sale', taxType: 'none', lines: [line] });
    const actual = postings.find((p) => p.account === 'actual')!;
    const current = postings.find((p) => p.account === 'current')!;
    expect(actual).toMatchObject({ debitPaise: R(1000), creditPaise: 0, label: 'sale' });
    expect(current).toMatchObject({ debitPaise: R(800), creditPaise: 0, label: 'sale' });
  });

  it('a purchase credits both accounts', () => {
    const { postings } = transactionPostings({ mode: 'purchase', taxType: 'none', lines: [line] });
    expect(postings.find((p) => p.account === 'actual')).toMatchObject({
      debitPaise: 0,
      creditPaise: R(1000),
      label: 'purchase',
    });
    expect(postings.find((p) => p.account === 'current')).toMatchObject({
      debitPaise: 0,
      creditPaise: R(800),
    });
  });

  it('a credit/debit note reverses the direction and is labelled note', () => {
    const { postings } = transactionPostings({
      mode: 'sale',
      taxType: 'none',
      lines: [line],
      isCreditDebitNote: true,
    });
    expect(postings.find((p) => p.account === 'actual')).toMatchObject({
      debitPaise: 0,
      creditPaise: R(1000),
      label: 'note',
    });
  });

  it('requires at least one line item', () => {
    expect(() => computeTransaction({ mode: 'sale', taxType: 'none', lines: [] })).toThrow(
      RangeError,
    );
  });
});

describe('GST tax types', () => {
  const input = {
    mode: 'sale' as const,
    lines: [{ quantity: 100, actualRatePaise: R(50), currentRatePaise: R(40), gstRatePercent: 18 }],
  };
  // current value = 100 × ₹40 = ₹4,000 → GST 18% = ₹720

  it('intra-state splits into equal CGST + SGST that sum to the total', () => {
    const c = computeTransaction({ ...input, taxType: 'intra' });
    const l = c.lines[0]!;
    expect(l.gstAmountPaise).toBe(R(720));
    expect(l.cgstPaise).toBe(R(360));
    expect(l.sgstPaise).toBe(R(360));
    expect(l.cgstPaise + l.sgstPaise).toBe(l.gstAmountPaise);
    expect(l.igstPaise).toBe(0);
  });

  it('inter-state puts the full amount in IGST', () => {
    const l = computeTransaction({ ...input, taxType: 'inter' }).lines[0]!;
    expect(l.igstPaise).toBe(R(720));
    expect(l.cgstPaise).toBe(0);
    expect(l.sgstPaise).toBe(0);
  });

  it('none applies no GST', () => {
    const c = computeTransaction({ ...input, taxType: 'none' });
    expect(c.totalGstPaise).toBe(0);
    expect(c.currentPostedPaise).toBe(R(4000));
  });
});

describe('discount & freight adjust the posted total', () => {
  it('subtracts discount and adds freight on both accounts', () => {
    const c = computeTransaction({
      mode: 'sale',
      taxType: 'none',
      lines: [
        { quantity: 1, actualRatePaise: R(10000), currentRatePaise: R(9000), gstRatePercent: 0 },
      ],
      discountPaise: R(500),
      freightPaise: R(200),
    });
    expect(c.actualPostedPaise).toBe(R(10000) - R(500) + R(200)); // 9,700
    expect(c.currentPostedPaise).toBe(R(9000) - R(500) + R(200)); // 8,700
  });
});

describe('movementPostings — scope', () => {
  it('actual-only received posts a single credit to actual', () => {
    const p = movementPostings({
      direction: 'received',
      amountPaise: R(1000),
      accountScope: 'actual',
    });
    expect(p).toEqual([
      { account: 'actual', debitPaise: 0, creditPaise: R(1000), label: 'receipt' },
    ]);
  });

  it('current-only paid posts a single debit to current', () => {
    const p = movementPostings({
      direction: 'paid',
      amountPaise: R(1000),
      accountScope: 'current',
    });
    expect(p).toEqual([
      { account: 'current', debitPaise: R(1000), creditPaise: 0, label: 'payment' },
    ]);
  });

  it('both-scope posts to actual and current', () => {
    const p = movementPostings({
      direction: 'received',
      amountPaise: R(1000),
      accountScope: 'both',
    });
    expect(p.map((x) => x.account)).toEqual(['actual', 'current']);
  });

  it('rejects non-positive amounts', () => {
    expect(() =>
      movementPostings({ direction: 'paid', amountPaise: 0, accountScope: 'actual' }),
    ).toThrow(RangeError);
  });
});

describe('openingPosting', () => {
  it('positive opening debits (dealer owes you)', () => {
    expect(openingPosting('actual', R(5000))).toMatchObject({
      debitPaise: R(5000),
      creditPaise: 0,
      label: 'opening',
    });
  });
  it('negative opening credits (you owe dealer)', () => {
    expect(openingPosting('actual', -R(5000))).toMatchObject({
      debitPaise: 0,
      creditPaise: R(5000),
    });
  });
});

describe('recomputeLedger — replay & void', () => {
  // actual: +1000 (debit), −300 (credit), +500 (debit) → 1000, 700, 1200
  const entries: ReplayEntry[] = [
    { id: 1, account: 'actual', entryDate: 10, debitPaise: R(1000), creditPaise: 0 },
    { id: 2, account: 'actual', entryDate: 20, debitPaise: 0, creditPaise: R(300) },
    { id: 3, account: 'actual', entryDate: 30, debitPaise: R(500), creditPaise: 0 },
    { id: 4, account: 'current', entryDate: 15, debitPaise: R(999), creditPaise: 0 }, // other account
  ];

  it('replays one account in (entry_date, id) order with running balances', () => {
    const replayed = recomputeLedger(entries, 'actual');
    expect(replayed.map((e) => e.runningBalancePaise)).toEqual([R(1000), R(700), R(1200)]);
    expect(balanceOf(entries, 'actual')).toBe(R(1200));
  });

  it('is deterministic when entries share a date (id breaks the tie)', () => {
    const sameDate: ReplayEntry[] = [
      { id: 2, account: 'actual', entryDate: 5, debitPaise: 0, creditPaise: R(100) },
      { id: 1, account: 'actual', entryDate: 5, debitPaise: R(1000), creditPaise: 0 },
    ];
    expect(recomputeLedger(sameDate, 'actual').map((e) => e.runningBalancePaise)).toEqual([
      R(1000),
      R(900),
    ]);
  });

  it('voiding an entry restores the exact pre-entry balance on replay', () => {
    const withReversal: ReplayEntry[] = [
      ...entries.map((e) => (e.id === 2 ? { ...e, isVoided: true } : e)),
      // reversing entry for the voided credit of 300 → a debit of 300
      { id: 5, account: 'actual', entryDate: 40, debitPaise: R(300), creditPaise: 0 },
    ];
    // 1000, (300 voided), 1500, +300 reversal → 1000, 1500, 1800
    expect(balanceOf(withReversal, 'actual')).toBe(R(1800));
    // and the source's own reversal via reversePosting is equal & opposite
    const original = {
      account: 'actual' as const,
      debitPaise: 0,
      creditPaise: R(300),
      label: 'receipt' as const,
    };
    expect(reversePosting(original)).toMatchObject({
      debitPaise: R(300),
      creditPaise: 0,
      label: 'adjustment',
    });
  });

  it('respects an opening balance', () => {
    expect(balanceOf(entries, 'actual', R(200))).toBe(R(1400));
  });
});

describe('applyToBalance & describeBalance', () => {
  it('balance = prev + debit − credit', () => {
    expect(applyToBalance(R(100), { debitPaise: R(50), creditPaise: R(30) })).toBe(R(120));
  });

  it('describes direction in plain language', () => {
    expect(describeBalance(R(5))).toEqual({ state: 'owes_you', magnitudePaise: R(5) });
    expect(describeBalance(-R(5))).toEqual({ state: 'you_owe', magnitudePaise: R(5) });
    expect(describeBalance(0)).toEqual({ state: 'settled', magnitudePaise: 0 });
  });
});
