/**
 * The pure ledger engine — no DB imports, no side effects.
 *
 * Given an event (transaction / money movement / opening), it returns the ledger
 * POSTINGS to apply (debit/credit per account). Running balances are computed
 * separately (write-time, or by `recomputeLedger` on replay). This is exactly the
 * module the SRS §6 acceptance scenarios exercise. See CLAUDE.md → Posting Rules,
 * Engineering Foundations. All money is integer paise via ./money.
 */
import { lineAmountPaise, gstAmountPaise, gstSplitPaise, invoiceRounding, sumPaise } from './money';

export type Account = 'actual' | 'current';
export type TransactionMode = 'sale' | 'purchase';
export type TaxType = 'intra' | 'inter' | 'none';
export type MovementDirection = 'received' | 'paid';
export type AccountScope = 'actual' | 'current' | 'both';
export type SourceType = 'transaction' | 'movement' | 'opening' | 'adjustment';
export type EntryLabel =
  'sale' | 'purchase' | 'receipt' | 'payment' | 'opening' | 'note' | 'adjustment';

/** A single ledger posting the engine produces (running balance not yet known). */
export interface Posting {
  account: Account;
  debitPaise: number; // increases balance → dealer owes business more
  creditPaise: number; // decreases balance → business owes dealer more
  label: EntryLabel;
}

// ---------------------------------------------------------------------------
// Transactions (goods) — dual valuation + GST, posts to BOTH accounts (SRS §7)
// ---------------------------------------------------------------------------

export interface TransactionLineInput {
  quantity: number;
  actualRatePaise: number;
  currentRatePaise: number;
  gstRatePercent: number;
}

export interface TransactionInput {
  mode: TransactionMode;
  taxType: TaxType;
  lines: readonly TransactionLineInput[];
  discountPaise?: number;
  freightPaise?: number;
  /** A credit/debit note or return posts in the reversing direction (SRS §8.5). */
  isCreditDebitNote?: boolean;
}

export interface ComputedLine {
  actualAmountPaise: number;
  currentAmountPaise: number;
  gstAmountPaise: number; // on the CURRENT value
  cgstPaise: number; // intra-state display split (else 0)
  sgstPaise: number;
  igstPaise: number; // inter-state (else 0)
}

export interface ComputedTransaction {
  lines: ComputedLine[];
  actualGoodsPaise: number;
  currentGoodsPaise: number;
  totalGstPaise: number;
  /** Rounded-to-rupee totals that actually post to the ledger (SRS §8.3). */
  actualPostedPaise: number;
  currentPostedPaise: number;
  actualRoundOffPaise: number;
  currentRoundOffPaise: number;
}

/** Compute per-line and per-account totals for a transaction (no posting direction yet). */
export function computeTransaction(input: TransactionInput): ComputedTransaction {
  if (input.lines.length === 0) {
    throw new RangeError('transaction requires at least one line item');
  }
  const discount = input.discountPaise ?? 0;
  const freight = input.freightPaise ?? 0;

  const lines = input.lines.map((l): ComputedLine => {
    const actualAmountPaise = lineAmountPaise(l.quantity, l.actualRatePaise);
    const currentAmountPaise = lineAmountPaise(l.quantity, l.currentRatePaise);

    if (input.taxType === 'none') {
      return {
        actualAmountPaise,
        currentAmountPaise,
        gstAmountPaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
      };
    }

    const gst = gstAmountPaise(currentAmountPaise, l.gstRatePercent);
    if (input.taxType === 'intra') {
      const { cgstPaise, sgstPaise } = gstSplitPaise(currentAmountPaise, l.gstRatePercent);
      return {
        actualAmountPaise,
        currentAmountPaise,
        gstAmountPaise: gst,
        cgstPaise,
        sgstPaise,
        igstPaise: 0,
      };
    }
    // inter-state → full IGST
    return {
      actualAmountPaise,
      currentAmountPaise,
      gstAmountPaise: gst,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: gst,
    };
  });

  const actualGoodsPaise = sumPaise(lines.map((l) => l.actualAmountPaise));
  const currentGoodsPaise = sumPaise(lines.map((l) => l.currentAmountPaise));
  const totalGstPaise = sumPaise(lines.map((l) => l.gstAmountPaise));

  // Discount reduces, freight adds; GST (real cash) is added to both accounts.
  const actualRaw = actualGoodsPaise - discount + freight + totalGstPaise;
  const currentRaw = currentGoodsPaise - discount + freight + totalGstPaise;

  const a = invoiceRounding(actualRaw);
  const c = invoiceRounding(currentRaw);

  return {
    lines,
    actualGoodsPaise,
    currentGoodsPaise,
    totalGstPaise,
    actualPostedPaise: a.roundedPaise,
    currentPostedPaise: c.roundedPaise,
    actualRoundOffPaise: a.roundOffPaise,
    currentRoundOffPaise: c.roundOffPaise,
  };
}

/** Postings for a transaction: sale debits both accounts, purchase credits both (SRS §7). */
export function transactionPostings(input: TransactionInput): {
  computed: ComputedTransaction;
  postings: Posting[];
} {
  const computed = computeTransaction(input);
  // sale → debit; purchase → credit; a credit/debit note flips the direction.
  const debitSide = (input.mode === 'sale') !== Boolean(input.isCreditDebitNote);
  const label: EntryLabel = input.isCreditDebitNote ? 'note' : input.mode;

  const mk = (account: Account, amount: number): Posting =>
    debitSide
      ? { account, debitPaise: amount, creditPaise: 0, label }
      : { account, debitPaise: 0, creditPaise: amount, label };

  return {
    computed,
    postings: [
      mk('actual', computed.actualPostedPaise),
      mk('current', computed.currentPostedPaise),
    ],
  };
}

// ---------------------------------------------------------------------------
// Money movements — advances / payments / receipts, posted per account scope
// ---------------------------------------------------------------------------

export interface MovementInput {
  direction: MovementDirection;
  amountPaise: number;
  accountScope: AccountScope;
}

/** Received → credit; paid → debit. Applied to the account(s) named by the scope (SRS §7). */
export function movementPostings(input: MovementInput): Posting[] {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new RangeError('money movement amount must be a positive integer paise value');
  }
  const isDebit = input.direction === 'paid';
  const label: EntryLabel = input.direction === 'received' ? 'receipt' : 'payment';
  const mk = (account: Account): Posting =>
    isDebit
      ? { account, debitPaise: input.amountPaise, creditPaise: 0, label }
      : { account, debitPaise: 0, creditPaise: input.amountPaise, label };

  const postings: Posting[] = [];
  if (input.accountScope === 'actual' || input.accountScope === 'both') postings.push(mk('actual'));
  if (input.accountScope === 'current' || input.accountScope === 'both')
    postings.push(mk('current'));
  return postings;
}

// ---------------------------------------------------------------------------
// Opening positions & corrections
// ---------------------------------------------------------------------------

/** An opening balance for one account. Positive → dealer owes you; negative → you owe. */
export function openingPosting(account: Account, signedBalancePaise: number): Posting {
  return {
    account,
    debitPaise: signedBalancePaise > 0 ? signedBalancePaise : 0,
    creditPaise: signedBalancePaise < 0 ? -signedBalancePaise : 0,
    label: 'opening',
  };
}

/** The equal-and-opposite reversing posting used to void a source (SRS §13.3). */
export function reversePosting(p: Posting): Posting {
  return {
    account: p.account,
    debitPaise: p.creditPaise,
    creditPaise: p.debitPaise,
    label: 'adjustment',
  };
}

// ---------------------------------------------------------------------------
// Running balances & replay
// ---------------------------------------------------------------------------

/** running_balance = prev + debit − credit (SRS §5). */
export function applyToBalance(
  prevBalancePaise: number,
  posting: { debitPaise: number; creditPaise: number },
): number {
  return prevBalancePaise + posting.debitPaise - posting.creditPaise;
}

export interface ReplayEntry {
  id: number;
  account: Account;
  entryDate: number; // epoch (seconds or ms) — ordering only
  debitPaise: number;
  creditPaise: number;
}

export interface ReplayedEntry extends ReplayEntry {
  runningBalancePaise: number;
}

/**
 * Replay ALL ledger entries for one account in deterministic (entry_date, id)
 * order and recompute running balances from the opening balance (or zero).
 *
 * Entries are never skipped: a void is represented by an appended, equal-and-opposite
 * reversing entry that itself counts in the balance (SRS §13.4). Callers pass every
 * ledger row (originals + reversals). Used to verify/repair stored running balances.
 */
export function recomputeLedger(
  entries: readonly ReplayEntry[],
  account: Account,
  openingBalancePaise = 0,
): ReplayedEntry[] {
  const ordered = entries
    .filter((e) => e.account === account)
    .slice()
    .sort((a, b) => a.entryDate - b.entryDate || a.id - b.id);

  let balance = openingBalancePaise;
  return ordered.map((e) => {
    balance = applyToBalance(balance, e);
    return { ...e, runningBalancePaise: balance };
  });
}

/** Final balance for an account after replay (or `openingBalancePaise` if no entries). */
export function balanceOf(
  entries: readonly ReplayEntry[],
  account: Account,
  openingBalancePaise = 0,
): number {
  const replayed = recomputeLedger(entries, account, openingBalancePaise);
  return replayed.length > 0
    ? replayed[replayed.length - 1]!.runningBalancePaise
    : openingBalancePaise;
}

// ---------------------------------------------------------------------------
// Plain-language balance (SRS §5) — the UI never shows a bare sign
// ---------------------------------------------------------------------------

export type BalanceState = 'owes_you' | 'you_owe' | 'settled';

export interface BalanceDescription {
  state: BalanceState;
  /** Always non-negative; format with `formatPaise` at render time. */
  magnitudePaise: number;
}

export function describeBalance(balancePaise: number): BalanceDescription {
  if (balancePaise > 0) return { state: 'owes_you', magnitudePaise: balancePaise };
  if (balancePaise < 0) return { state: 'you_owe', magnitudePaise: -balancePaise };
  return { state: 'settled', magnitudePaise: 0 };
}
