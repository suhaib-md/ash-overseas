import { describe, it, expect } from 'vitest';
import {
  roundPaise,
  lineAmountPaise,
  gstAmountPaise,
  gstSplitPaise,
  roundToRupeePaise,
  invoiceRounding,
  sumPaise,
} from './money';

// Rupee → paise helper for readable expectations.
const R = (rupees: number) => Math.round(rupees * 100);

describe('roundPaise', () => {
  it('rounds half away from zero', () => {
    expect(roundPaise(0.5)).toBe(1);
    expect(roundPaise(1.5)).toBe(2);
    expect(roundPaise(2.5)).toBe(3);
    expect(roundPaise(2.49)).toBe(2);
    expect(roundPaise(-0.5)).toBe(-1);
    expect(roundPaise(-2.5)).toBe(-3);
  });

  it('leaves integers untouched and rejects non-finite input', () => {
    expect(roundPaise(4108320)).toBe(4108320);
    expect(() => roundPaise(Number.NaN)).toThrow(RangeError);
    expect(() => roundPaise(Infinity)).toThrow(RangeError);
  });
});

describe('lineAmountPaise', () => {
  it('reproduces SRS §6 line values (actual)', () => {
    // ASH 39: 9,510 kg × ₹33 = ₹3,13,830
    expect(lineAmountPaise(9510, R(33))).toBe(R(313830));
    // ASH 42: 11,650 kg × ₹26 = ₹3,02,900
    expect(lineAmountPaise(11650, R(26))).toBe(R(302900));
  });

  it('reproduces SRS §6 line values (current / declared)', () => {
    // ASH 39: 9,510 × ₹24 = ₹2,28,240
    expect(lineAmountPaise(9510, R(24))).toBe(R(228240));
    // ASH 42: 11,650 × ₹16 = ₹1,86,400
    expect(lineAmountPaise(11650, R(16))).toBe(R(186400));
  });

  it('rejects negative inputs', () => {
    expect(() => lineAmountPaise(-1, 100)).toThrow(RangeError);
    expect(() => lineAmountPaise(1, -100)).toThrow(RangeError);
  });
});

describe('gstAmountPaise (on current value)', () => {
  it('reproduces SRS Scenario C GST amounts at 18%', () => {
    // ASH 39: 18% of ₹2,28,240 = ₹41,083.20
    expect(gstAmountPaise(R(228240), 18)).toBe(4108320);
    // ASH 42: 18% of ₹1,86,400 = ₹33,552.00
    expect(gstAmountPaise(R(186400), 18)).toBe(R(33552));
  });

  it('validates the rate', () => {
    expect(() => gstAmountPaise(R(1000), -1)).toThrow(RangeError);
    expect(() => gstAmountPaise(R(1000), 101)).toThrow(RangeError);
  });
});

describe('gstSplitPaise (intra-state)', () => {
  it('splits into two equal halves that sum to the total (ASH 39)', () => {
    const { cgstPaise, sgstPaise } = gstSplitPaise(R(228240), 18);
    expect(cgstPaise).toBe(2054160); // ₹20,541.60
    expect(sgstPaise).toBe(2054160);
    expect(cgstPaise + sgstPaise).toBe(gstAmountPaise(R(228240), 18));
  });
});

describe('invoice rounding (SRS §8.3)', () => {
  it('rounds the raw grand total to the nearest rupee and records round-off', () => {
    // ASH 39 invoice: taxable ₹2,28,240 + GST ₹41,083.20 = ₹2,69,323.20 raw
    const raw = R(228240) + gstAmountPaise(R(228240), 18); // 26,932,320 paise
    const { roundedPaise, roundOffPaise } = invoiceRounding(raw);
    expect(roundedPaise).toBe(R(269323)); // posts ₹2,69,323.00
    expect(roundOffPaise).toBe(-20); // −₹0.20
  });

  it('ASH 42 invoice comes out exact (₹2,19,952, no round-off)', () => {
    const raw = R(186400) + gstAmountPaise(R(186400), 18); // 21,995,200 paise
    const { roundedPaise, roundOffPaise } = invoiceRounding(raw);
    expect(roundedPaise).toBe(R(219952));
    expect(roundOffPaise).toBe(0);
  });

  it('roundToRupeePaise snaps to whole rupees', () => {
    expect(roundToRupeePaise(26932320)).toBe(26932300);
    expect(roundToRupeePaise(26932350)).toBe(26932400); // ₹0.50 rounds up
  });
});

describe('sumPaise', () => {
  it('sums integer paise', () => {
    expect(sumPaise([R(228240), 4108320, -20])).toBe(R(269323));
  });
  it('rejects non-integer paise', () => {
    expect(() => sumPaise([1.5])).toThrow(RangeError);
  });
});
