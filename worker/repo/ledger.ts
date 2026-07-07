import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { ledgerEntries } from '../db/schema';
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
}

/** Chronological ledger for one account, oldest → newest ((entry_date, id) order). */
export async function getLedger(
  db: Db,
  dealerId: number,
  account: Account,
): Promise<LedgerEntryView[]> {
  return db
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
}
