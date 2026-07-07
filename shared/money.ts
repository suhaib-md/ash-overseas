/**
 * Money math — the single owner of every arithmetic operation on paise.
 *
 * RULES (see CLAUDE.md → Money Rule + Engineering Foundations):
 *  - All money is an integer number of paise (₹1 = 100 paise).
 *  - No floating-point money exists. This module never returns a fractional value.
 *  - Nothing else in the codebase may do ad-hoc `*` / `/` / `Math.round` on money.
 *
 * Rounding is HALF-AWAY-FROM-ZERO ("round to nearest", ties out), matching the
 * owner's rupee-based working figures.
 */

/** Round a (possibly fractional) paise value to the nearest whole paise. */
export function roundPaise(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundPaise: expected a finite number, got ${value}`);
  }
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

/** Line amount = quantity × rate. Quantity is real, so the product may be fractional. */
export function lineAmountPaise(quantity: number, ratePaise: number): number {
  if (quantity < 0) throw new RangeError(`lineAmountPaise: negative quantity ${quantity}`);
  if (ratePaise < 0) throw new RangeError(`lineAmountPaise: negative rate ${ratePaise}`);
  return roundPaise(quantity * ratePaise);
}

/**
 * GST on the CURRENT (declared) value — never on the actual value.
 * `gst_amount = round(current_amount_paise × rate% / 100)`.
 */
export function gstAmountPaise(currentAmountPaise: number, gstRatePercent: number): number {
  assertRate(gstRatePercent);
  return roundPaise((currentAmountPaise * gstRatePercent) / 100);
}

/**
 * Intra-state split: CGST = SGST = round(current_amount_paise × rate% / 200) each,
 * computed independently. Their sum may differ from `gstAmountPaise` by one paise —
 * that is correct and display-only; the ledger uses the single total.
 */
export function gstSplitPaise(
  currentAmountPaise: number,
  gstRatePercent: number,
): { cgstPaise: number; sgstPaise: number } {
  assertRate(gstRatePercent);
  const half = roundPaise((currentAmountPaise * gstRatePercent) / 200);
  return { cgstPaise: half, sgstPaise: half };
}

/** Round a paise amount to the nearest whole rupee, expressed back in paise. */
export function roundToRupeePaise(paise: number): number {
  return roundPaise(paise / 100) * 100;
}

/**
 * Invoice rounding: round the raw grand total (current side) to the nearest rupee.
 * `round_off = rounded − raw` (can be negative). The rounded total posts to the ledger.
 */
export function invoiceRounding(rawTotalPaise: number): {
  roundedPaise: number;
  roundOffPaise: number;
} {
  const roundedPaise = roundToRupeePaise(rawTotalPaise);
  return { roundedPaise, roundOffPaise: roundedPaise - rawTotalPaise };
}

/** Sum a list of integer-paise amounts, asserting each is an integer. */
export function sumPaise(amounts: readonly number[]): number {
  let total = 0;
  for (const a of amounts) {
    if (!Number.isInteger(a)) throw new RangeError(`sumPaise: non-integer paise ${a}`);
    total += a;
  }
  return total;
}

function assertRate(gstRatePercent: number): void {
  if (!Number.isFinite(gstRatePercent) || gstRatePercent < 0 || gstRatePercent > 100) {
    throw new RangeError(`GST rate must be between 0 and 100, got ${gstRatePercent}`);
  }
}
