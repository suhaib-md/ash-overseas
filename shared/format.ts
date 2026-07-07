/**
 * Display + input formatting for money. Conversion from paise happens ONLY here
 * and at render time — never in storage, computation, or API responses.
 */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Render integer paise as `₹1,23,456.78` (Indian grouping). */
export function formatPaise(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new RangeError(`formatPaise: expected integer paise, got ${paise}`);
  }
  // Divide only for display; the stored value stays integer paise.
  return inr.format(paise / 100);
}

/** Render integer paise as a plain grouped number `1,23,456.78` (no currency symbol). */
export function formatPaisePlain(paise: number): string {
  return formatPaise(paise).replace(/^₹\s?/, '');
}

/**
 * Parse a user-typed rupee string into integer paise WITHOUT floating point.
 * Accepts optional ₹, Indian/US grouping commas, and up to 2 decimal places.
 * Throws RangeError on anything malformed or with more than 2 decimals.
 */
export function parseRupeesToPaise(input: string): number {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (cleaned === '' || cleaned === '-') {
    throw new RangeError(`parseRupeesToPaise: empty input`);
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new RangeError(`parseRupeesToPaise: invalid amount "${input}"`);
  }
  const negative = cleaned.startsWith('-');
  const parts = cleaned.replace('-', '').split('.');
  const whole = parts[0] ?? '0';
  const frac = parts[1] ?? '';
  const paise = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return negative ? -paise : paise;
}
