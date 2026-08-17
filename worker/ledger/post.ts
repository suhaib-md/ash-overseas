/**
 * The posting layer — wraps the pure ledger engine (shared/ledger) with D1 writes.
 *
 * Every event's rows (source + lines + ledger entries + audit) commit in a SINGLE
 * `db.batch(...)` so they are atomic: all or nothing (CLAUDE.md → Atomicity). IDs are
 * pre-allocated (single-writer safe) so the whole event fits in one batch. Running
 * balances are computed from the stored previous balance (SRS §13.1).
 */
import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Db } from '../db/client';
import {
  transactions,
  transactionLines,
  moneyMovements,
  ledgerEntries,
  auditLog,
} from '../db/schema';
import {
  type Account,
  type AccountScope,
  type MovementDirection,
  type SourceType,
  type TaxType,
  type TransactionMode,
  type TransactionLineInput,
  applyToBalance,
  movementPostings,
  openingPosting,
  recomputeLedger,
  transactionPostings,
} from '../../shared/ledger';

// --- helpers ---------------------------------------------------------------

/** Next primary key for a table (single-writer safe; lets us keep one atomic batch). */
async function nextId(db: Db, table: SQLiteTable): Promise<number> {
  const rows = await db.select({ max: sql<number>`coalesce(max(id), 0)` }).from(table);
  return (rows[0]?.max ?? 0) + 1;
}

/** Latest stored running balance for a dealer + account, or 0 if none (SRS §13.1). */
async function latestBalance(db: Db, dealerId: number, account: Account): Promise<number> {
  const rows = await db
    .select({ bal: ledgerEntries.runningBalancePaise })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.dealerId, dealerId), eq(ledgerEntries.account, account)))
    .orderBy(desc(ledgerEntries.entryDate), desc(ledgerEntries.id))
    .limit(1);
  return rows[0]?.bal ?? 0;
}

/** Next human id: `{MODE}-{YYYY}-{MM}-{NNNN}`, a zero-padded per-mode-per-month sequence. */
async function nextHumanId(db: Db, mode: TransactionMode, date: Date): Promise<string> {
  const prefix = `${mode.toUpperCase()}-${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-`;
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.mode, mode), like(transactions.humanId, `${prefix}%`)));
  return `${prefix}${String((rows[0]?.c ?? 0) + 1).padStart(4, '0')}`;
}

function auditCreate(entity: string, entityId: number, after: unknown) {
  return { action: 'create', entity, entityId, beforeJson: null, afterJson: JSON.stringify(after) };
}

/** A ledger row that is about to be inserted, taking part in a replay before it exists. */
interface PendingEntry {
  id: number;
  account: Account;
  entryDate: Date;
  debitPaise: number;
  creditPaise: number;
  runningBalancePaise: number;
}

/**
 * Replay `accounts` in canonical `(entry_date, id)` order **including** the `pending`
 * rows, write each pending row's correct balance into it, and return UPDATE statements
 * for the already-stored rows whose running balance the replay changed.
 *
 * Needed whenever a row lands anywhere other than the very end of the ledger: every
 * later row's stored balance was computed without it (SRS §13.2/§13.3).
 */
async function replayAccounts(
  db: Db,
  dealerId: number,
  accounts: readonly Account[],
  pending: PendingEntry[],
) {
  const stored = await db
    .select({
      id: ledgerEntries.id,
      account: ledgerEntries.account,
      entryDate: ledgerEntries.entryDate,
      debitPaise: ledgerEntries.debitPaise,
      creditPaise: ledgerEntries.creditPaise,
      runningBalancePaise: ledgerEntries.runningBalancePaise,
    })
    .from(ledgerEntries)
    .where(
      and(eq(ledgerEntries.dealerId, dealerId), inArray(ledgerEntries.account, [...accounts])),
    );

  // recomputeLedger orders on a numeric date; ids are globally unique across accounts.
  const all = [...stored, ...pending].map((e) => ({
    id: e.id,
    account: e.account,
    entryDate: e.entryDate.getTime(),
    debitPaise: e.debitPaise,
    creditPaise: e.creditPaise,
  }));
  const storedById = new Map(stored.map((s) => [s.id, s]));
  const pendingById = new Map(pending.map((p) => [p.id, p]));

  const fixes = [];
  const finals: Partial<Record<Account, number>> = {};
  for (const account of accounts) {
    const replayedAll = recomputeLedger(all, account);
    finals[account] = replayedAll.at(-1)?.runningBalancePaise ?? 0;
    for (const replayed of replayedAll) {
      const p = pendingById.get(replayed.id);
      if (p) {
        p.runningBalancePaise = replayed.runningBalancePaise;
        continue;
      }
      const s = storedById.get(replayed.id);
      if (s && s.runningBalancePaise !== replayed.runningBalancePaise) {
        fixes.push(
          db
            .update(ledgerEntries)
            .set({ runningBalancePaise: replayed.runningBalancePaise })
            .where(eq(ledgerEntries.id, replayed.id)),
        );
      }
    }
  }
  return { fixes, finals };
}

// --- transactions ----------------------------------------------------------

export interface PostTransactionLine extends TransactionLineInput {
  itemName: string;
  unit?: string | null;
}

export interface PostTransactionInput {
  dealerId: number;
  date: Date;
  mode: TransactionMode;
  taxType: TaxType;
  lines: readonly PostTransactionLine[];
  discountPaise?: number;
  freightPaise?: number;
  referenceTag?: string | null;
  invoiceNo?: string | null;
  invoiceDate?: Date | null;
  irn?: string | null;
  ewayBill?: string | null;
  notes?: string | null;
  isCreditDebitNote?: boolean;
}

export interface PostTransactionResult {
  transactionId: number;
  humanId: string;
  actualBalancePaise: number;
  currentBalancePaise: number;
}

export async function postTransaction(
  db: Db,
  input: PostTransactionInput,
): Promise<PostTransactionResult> {
  const { computed, postings } = transactionPostings({
    mode: input.mode,
    taxType: input.taxType,
    lines: input.lines,
    discountPaise: input.discountPaise,
    freightPaise: input.freightPaise,
    isCreditDebitNote: input.isCreditDebitNote,
  });

  const [txnId, humanId, firstEntryId] = await Promise.all([
    nextId(db, transactions),
    nextHumanId(db, input.mode, input.date),
    nextId(db, ledgerEntries),
  ]);

  const actual = postings.find((p) => p.account === 'actual')!;
  const current = postings.find((p) => p.account === 'current')!;
  const description = input.referenceTag ?? humanId;

  const txnRow = {
    id: txnId,
    humanId,
    referenceTag: input.referenceTag ?? null,
    mode: input.mode,
    dealerId: input.dealerId,
    date: input.date,
    taxType: input.taxType,
    invoiceNo: input.invoiceNo ?? null,
    invoiceDate: input.invoiceDate ?? null,
    irn: input.irn ?? null,
    ewayBill: input.ewayBill ?? null,
    discountPaise: input.discountPaise ?? 0,
    freightPaise: input.freightPaise ?? 0,
    roundOffPaise: computed.currentRoundOffPaise, // invoice round-off (SRS §8.3)
    isCreditDebitNote: input.isCreditDebitNote ?? false,
    notes: input.notes ?? null,
  };

  const lineRows = computed.lines.map((cl, i) => {
    const src = input.lines[i]!;
    return {
      transactionId: txnId,
      itemName: src.itemName,
      quantity: src.quantity,
      unit: src.unit ?? null,
      actualRatePaise: src.actualRatePaise,
      actualAmountPaise: cl.actualAmountPaise,
      currentRatePaise: src.currentRatePaise,
      currentAmountPaise: cl.currentAmountPaise,
      gstRate: src.gstRatePercent,
      gstAmountPaise: cl.gstAmountPaise,
    };
  });

  const entryRows = [
    {
      id: firstEntryId,
      dealerId: input.dealerId,
      account: 'actual' as const,
      entryDate: input.date,
      sourceType: 'transaction' as const,
      sourceId: txnId,
      debitPaise: actual.debitPaise,
      creditPaise: actual.creditPaise,
      runningBalancePaise: 0, // set by the replay below
      label: actual.label,
      description,
    },
    {
      id: firstEntryId + 1,
      dealerId: input.dealerId,
      account: 'current' as const,
      entryDate: input.date,
      sourceType: 'transaction' as const,
      sourceId: txnId,
      debitPaise: current.debitPaise,
      creditPaise: current.creditPaise,
      runningBalancePaise: 0, // set by the replay below
      label: current.label,
      description,
    },
  ];

  // Replay rather than just appending to the latest balance: the entry may be
  // back-dated, in which case it lands mid-ledger and every later entry's stored
  // balance needs rewriting (SRS §13.2).
  const { fixes, finals } = await replayAccounts(
    db,
    input.dealerId,
    ['actual', 'current'],
    entryRows,
  );

  await db.batch([
    db.insert(transactions).values(txnRow),
    db.insert(transactionLines).values(lineRows),
    db.insert(ledgerEntries).values(entryRows),
    ...fixes,
    db.insert(auditLog).values(auditCreate('transactions', txnId, { ...txnRow, lines: lineRows })),
  ]);

  return {
    transactionId: txnId,
    humanId,
    actualBalancePaise: finals.actual ?? 0,
    currentBalancePaise: finals.current ?? 0,
  };
}

// --- money movements -------------------------------------------------------

export interface PostMovementInput {
  dealerId: number;
  date: Date;
  direction: MovementDirection;
  amountPaise: number;
  accountScope: AccountScope;
  method?: 'cash' | 'bank' | 'cheque' | 'upi' | null;
  reference?: string | null;
  notes?: string | null;
  mode?: TransactionMode | null;
}

export async function postMovement(
  db: Db,
  input: PostMovementInput,
): Promise<{ movementId: number; balances: Partial<Record<Account, number>> }> {
  const postings = movementPostings({
    direction: input.direction,
    amountPaise: input.amountPaise,
    accountScope: input.accountScope,
  });

  const [movementId, firstEntryId] = await Promise.all([
    nextId(db, moneyMovements),
    nextId(db, ledgerEntries),
  ]);
  const entryRows = postings.map((p, i) => ({
    id: firstEntryId + i,
    dealerId: input.dealerId,
    account: p.account,
    entryDate: input.date,
    sourceType: 'movement' as const,
    sourceId: movementId,
    debitPaise: p.debitPaise,
    creditPaise: p.creditPaise,
    runningBalancePaise: 0, // set by the replay below
    label: p.label,
    description: input.reference ?? null,
  }));

  // As in postTransaction: a back-dated movement lands mid-ledger, so replay.
  const { fixes, finals } = await replayAccounts(
    db,
    input.dealerId,
    postings.map((p) => p.account),
    entryRows,
  );
  const balances: Partial<Record<Account, number>> = finals;

  const movementRow = {
    id: movementId,
    dealerId: input.dealerId,
    mode: input.mode ?? null,
    date: input.date,
    direction: input.direction,
    amountPaise: input.amountPaise,
    method: input.method ?? null,
    reference: input.reference ?? null,
    accountScope: input.accountScope,
    notes: input.notes ?? null,
  };

  await db.batch([
    db.insert(moneyMovements).values(movementRow),
    db.insert(ledgerEntries).values(entryRows),
    ...fixes,
    db.insert(auditLog).values(auditCreate('money_movements', movementId, movementRow)),
  ]);

  return { movementId, balances };
}

// --- opening positions -----------------------------------------------------

export async function postOpening(
  db: Db,
  input: { dealerId: number; account: Account; signedBalancePaise: number; date: Date },
): Promise<{ balancePaise: number }> {
  const posting = openingPosting(input.account, input.signedBalancePaise);
  const balancePaise = applyToBalance(
    await latestBalance(db, input.dealerId, input.account),
    posting,
  );

  const entryRow = {
    dealerId: input.dealerId,
    account: input.account,
    entryDate: input.date,
    sourceType: 'opening' as const,
    sourceId: input.dealerId,
    debitPaise: posting.debitPaise,
    creditPaise: posting.creditPaise,
    runningBalancePaise: balancePaise,
    label: 'opening',
    description: 'Opening balance',
  };

  await db.batch([
    db.insert(ledgerEntries).values(entryRow),
    db.insert(auditLog).values(auditCreate('ledger_entries', input.dealerId, entryRow)),
  ]);

  return { balancePaise };
}

// --- voids / corrections ---------------------------------------------------

/**
 * Void a transaction or money movement: flag the source, append equal-and-opposite
 * reversing ledger entries (SRS §13.3/13.4), and write an audit row — all atomically.
 * The originals are retained; the reversals neutralise their effect on replay.
 *
 * Two rules make the resulting ledger read correctly, both required by the SRS:
 *
 * 1. The reversal carries the **original entry's date**, so it sorts adjacent to what
 *    it reverses (SRS §10.7) instead of jumping to the end of the ledger. Stamping it
 *    with `new Date()` put it after every same-day entry, which pinned it to the top of
 *    the newest-first view and made the headline balance read the reversal's (stale)
 *    running balance rather than the genuinely-latest entry.
 * 2. Inserting an entry in the *middle* of the ledger invalidates the stored running
 *    balance of everything after it, so we replay the affected accounts and rewrite
 *    them in the same batch — "the replay function then restores correct running
 *    balances" (SRS §13.3).
 */
export async function voidSource(
  db: Db,
  input: { sourceType: 'transaction' | 'movement'; sourceId: number; entryDate?: Date },
): Promise<{ reversalCount: number }> {
  const dbSourceType: SourceType = input.sourceType === 'transaction' ? 'transaction' : 'movement';

  const originals = await db
    .select()
    .from(ledgerEntries)
    .where(
      and(eq(ledgerEntries.sourceType, dbSourceType), eq(ledgerEntries.sourceId, input.sourceId)),
    );
  if (originals.length === 0)
    throw new Error(`no ledger entries for ${dbSourceType} #${input.sourceId}`);

  const dealerId = originals[0]!.dealerId;
  // Pre-allocate ids so the reversals can take part in the replay below and still
  // commit inside one batch (single-writer, as elsewhere in this module).
  const firstReversalId = await nextId(db, ledgerEntries);

  const reversalRows = originals.map((o, i) => ({
    id: firstReversalId + i,
    dealerId,
    account: o.account,
    entryDate: input.entryDate ?? o.entryDate, // adjacent to the original (SRS §10.7)
    sourceType: 'adjustment' as const,
    sourceId: input.sourceId,
    debitPaise: o.creditPaise,
    creditPaise: o.debitPaise,
    runningBalancePaise: 0, // replaced by the replay below
    label: 'adjustment',
    description: `Reversal of ${dbSourceType} #${input.sourceId}`,
  }));

  const { fixes: balanceFixes } = await replayAccounts(
    db,
    dealerId,
    [...new Set(originals.map((o) => o.account))],
    reversalRows,
  );

  const updateSource =
    input.sourceType === 'transaction'
      ? db.update(transactions).set({ isVoided: true }).where(eq(transactions.id, input.sourceId))
      : db
          .update(moneyMovements)
          .set({ isVoided: true })
          .where(eq(moneyMovements.id, input.sourceId));

  await db.batch([
    updateSource,
    db.insert(ledgerEntries).values(reversalRows),
    ...balanceFixes,
    db.insert(auditLog).values({
      action: 'void',
      entity: input.sourceType === 'transaction' ? 'transactions' : 'money_movements',
      entityId: input.sourceId,
      beforeJson: JSON.stringify({ isVoided: false }),
      afterJson: JSON.stringify({ isVoided: true, reversals: reversalRows.length }),
    }),
  ]);

  return { reversalCount: reversalRows.length };
}
