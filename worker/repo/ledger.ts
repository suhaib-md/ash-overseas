import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { ledgerEntries, moneyMovements, transactions } from '../db/schema';
import { type Account, type BalanceDescription, describeBalance } from '../../shared/ledger';

export async function getBalance(db: Db, dealerId: number, account: Account): Promise<number> {
  const rows = await db
    .select({ bal: ledgerEntries.runningBalancePaise })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.dealerId, dealerId), eq(ledgerEntries.account, account)))
    .orderBy(desc(ledgerEntries.entryDate), desc(ledgerEntries.id))
    .limit(1);
  return rows[0]?.bal ?? 0;
}

export interface AccountBalance extends BalanceDescription {
  balancePaise: number;
}

function toBalance(balancePaise: number): AccountBalance {
  return { balancePaise, ...describeBalance(balancePaise) };
}

/** Both signed balances + plain-language descriptions, served from stored values (NFR-P2). */
export async function getDealerBalances(
  db: Db,
  dealerId: number,
): Promise<{ actual: AccountBalance; current: AccountBalance }> {
  const [actual, current] = await Promise.all([
    getBalance(db, dealerId, 'actual'),
    getBalance(db, dealerId, 'current'),
  ]);
  return { actual: toBalance(actual), current: toBalance(current) };
}

export interface LedgerEntryView {
  id: number;
  entryDate: Date;
  label: string | null;
  description: string | null;
  debitPaise: number;
  creditPaise: number;
  runningBalancePaise: number;
  sourceType: string;
  sourceId: number | null;
  /** The originating transaction/movement is voided → show struck-through. */
  isVoided: boolean;
  /** This entry's source can be voided from the UI (a live transaction/movement). */
  voidable: boolean;
}

/** Chronological ledger for one account, oldest → newest ((entry_date, id) order). */
export async function getLedger(
  db: Db,
  dealerId: number,
  account: Account,
): Promise<LedgerEntryView[]> {
  const rows = await db
    .select({
      id: ledgerEntries.id,
      entryDate: ledgerEntries.entryDate,
      label: ledgerEntries.label,
      description: ledgerEntries.description,
      debitPaise: ledgerEntries.debitPaise,
      creditPaise: ledgerEntries.creditPaise,
      runningBalancePaise: ledgerEntries.runningBalancePaise,
      sourceType: ledgerEntries.sourceType,
      sourceId: ledgerEntries.sourceId,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.dealerId, dealerId), eq(ledgerEntries.account, account)))
    .orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id));

  // Which source transactions/movements are voided (for strike-through display).
  const txnIds = rows
    .filter((r) => r.sourceType === 'transaction' && r.sourceId != null)
    .map((r) => r.sourceId!);
  const movIds = rows
    .filter((r) => r.sourceType === 'movement' && r.sourceId != null)
    .map((r) => r.sourceId!);
  const voidedTxn = txnIds.length
    ? new Set(
        (
          await db
            .select({ id: transactions.id })
            .from(transactions)
            .where(and(inArray(transactions.id, txnIds), eq(transactions.isVoided, true)))
        ).map((r) => r.id),
      )
    : new Set<number>();
  const voidedMov = movIds.length
    ? new Set(
        (
          await db
            .select({ id: moneyMovements.id })
            .from(moneyMovements)
            .where(and(inArray(moneyMovements.id, movIds), eq(moneyMovements.isVoided, true)))
        ).map((r) => r.id),
      )
    : new Set<number>();

  return rows.map((r) => {
    const isVoided =
      (r.sourceType === 'transaction' && r.sourceId != null && voidedTxn.has(r.sourceId)) ||
      (r.sourceType === 'movement' && r.sourceId != null && voidedMov.has(r.sourceId));
    const voidable = (r.sourceType === 'transaction' || r.sourceType === 'movement') && !isVoided;
    return { ...r, isVoided, voidable };
  });
}
