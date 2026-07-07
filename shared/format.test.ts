import { describe, it, expect } from 'vitest';
import { formatPaise, formatPaisePlain, parseRupeesToPaise } from './format';

describe('formatPaise', () => {
  it('renders integer paise with Indian grouping and ₹', () => {
    expect(formatPaise(12345678)).toBe('₹1,23,456.78');
    expect(formatPaise(0)).toBe('₹0.00');
    expect(formatPaise(100)).toBe('₹1.00');
    expect(formatPaise(-35000000)).toBe('-₹3,50,000.00'); // "You owe" magnitude
  });

  it('rejects non-integer paise (no float money)', () => {
    expect(() => formatPaise(1.5)).toThrow(RangeError);
  });

  it('formatPaisePlain drops the currency symbol', () => {
    expect(formatPaisePlain(12345678)).toBe('1,23,456.78');
  });
});

describe('parseRupeesToPaise', () => {
  it('parses grouped rupees and decimals into exact integer paise', () => {
    expect(parseRupeesToPaise('3,13,830')).toBe(31383000);
    expect(parseRupeesToPaise('313830.50')).toBe(31383050);
    expect(parseRupeesToPaise('₹1,23,456.78')).toBe(12345678);
    expect(parseRupeesToPaise('0')).toBe(0);
    expect(parseRupeesToPaise('5')).toBe(500);
    expect(parseRupeesToPaise('5.7')).toBe(570);
    expect(parseRupeesToPaise('-1000')).toBe(-100000);
  });

  it('round-trips with formatPaise', () => {
    for (const paise of [0, 100, 570, 12345678, 31383050]) {
      expect(parseRupeesToPaise(formatPaise(paise))).toBe(paise);
    }
  });

  it('rejects malformed input and >2 decimals', () => {
    expect(() => parseRupeesToPaise('')).toThrow(RangeError);
    expect(() => parseRupeesToPaise('abc')).toThrow(RangeError);
    expect(() => parseRupeesToPaise('1.234')).toThrow(RangeError);
    expect(() => parseRupeesToPaise('1.2.3')).toThrow(RangeError);
  });
});
