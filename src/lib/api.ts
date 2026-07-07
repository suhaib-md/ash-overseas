import type { BalanceState } from '../../shared/ledger';

export type DealerType = 'supplier' | 'buyer' | 'both';
export type AccountName = 'actual' | 'current';

export interface DealerListItem {
  id: number;
  name: string;
  type: DealerType;
  gstin: string | null;
  actualBalancePaise: number;
}

export interface Dealer {
  id: number;
  name: string;
  contact: string | null;
  address: string | null;
  gstin: string | null;
  stateCode: string | null;
  type: DealerType;
  isArchived: boolean;
}

export interface AccountBalance {
  balancePaise: number;
  state: BalanceState;
  magnitudePaise: number;
}

export interface LedgerEntry {
  id: number;
  entryDate: string;
  label: string | null;
  description: string | null;
  debitPaise: number;
  creditPaise: number;
  runningBalancePaise: number;
  sourceType: string;
  sourceId: number | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; issues?: { message: string }[] };
      if (body.issues?.length) message = body.issues.map((i) => i.message).join(', ');
      else if (body.error) message = body.error;
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const listDealers = (activity: string, q: string) =>
  api<{ dealers: DealerListItem[] }>(
    `/dealers?activity=${activity}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
  );

export const getDealer = (id: number) =>
  api<{ dealer: Dealer; balances: { actual: AccountBalance; current: AccountBalance } }>(
    `/dealers/${id}`,
  );

export const getLedger = (id: number, account: AccountName) =>
  api<{ account: AccountName; headline: AccountBalance; entries: LedgerEntry[] }>(
    `/dealers/${id}/ledger?account=${account}`,
  );

export const createDealer = (body: unknown) =>
  api<{ dealer: Dealer }>(`/dealers`, { method: 'POST', body: JSON.stringify(body) });

export const createTransaction = (body: unknown) =>
  api<{ transaction: { humanId: string; transactionId: number } }>(`/transactions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const createMovement = (body: unknown) =>
  api<{ movement: { movementId: number } }>(`/movements`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
