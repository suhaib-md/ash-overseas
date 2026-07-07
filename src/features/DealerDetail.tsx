import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, HandCoins, Plus } from 'lucide-react';
import {
  getDealer,
  getLedger,
  type AccountBalance,
  type AccountName,
  type Dealer,
  type LedgerEntry,
} from '../lib/api';
import { BalanceHeadline, InlineBalance, MoneyDisplay } from '../components/money';
import { AddMoneyForm, AddTransactionForm } from './forms';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function DealerDetail({ dealerId, onBack }: { dealerId: number; onBack: () => void }) {
  const [account, setAccount] = useState<AccountName>('actual');
  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [balances, setBalances] = useState<{
    actual: AccountBalance;
    current: AccountBalance;
  } | null>(null);
  const [ledger, setLedger] = useState<{ headline: AccountBalance; entries: LedgerEntry[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'txn' | 'money' | null>(null);

  const loadHeader = useCallback(() => {
    getDealer(dealerId)
      .then((r) => {
        setDealer(r.dealer);
        setBalances(r.balances);
      })
      .catch((e) => setError((e as Error).message));
  }, [dealerId]);

  const loadLedger = useCallback(() => {
    setLedger(null);
    getLedger(dealerId, account)
      .then((r) => setLedger({ headline: r.headline, entries: r.entries }))
      .catch((e) => setError((e as Error).message));
  }, [dealerId, account]);

  useEffect(loadHeader, [loadHeader]);
  useEffect(loadLedger, [loadLedger]);

  function afterWrite() {
    setModal(null);
    loadHeader();
    loadLedger();
  }

  const headline = ledger?.headline ?? balances?.[account] ?? null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-body-md text-on-surface-variant hover:text-primary"
      >
        <ArrowLeft size={16} /> Dealers
      </button>

      {error && (
        <p className="rounded-lg bg-negative-container p-3 text-body-md text-on-negative-container">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-headline-md text-primary">{dealer?.name ?? '…'}</h1>
          {dealer?.gstin && (
            <p className="text-body-md text-on-surface-variant">GSTIN {dealer.gstin}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setModal('money')}
            className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-2 text-label-caps font-semibold hover:bg-surface-container"
          >
            <HandCoins size={16} /> Add money
          </button>
          <button
            type="button"
            onClick={() => setModal('txn')}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-label-caps font-semibold text-on-primary hover:opacity-90"
          >
            <Plus size={16} /> Add transaction
          </button>
        </div>
      </div>

      {/* Actual / Current segmented control */}
      <div>
        <div className="inline-flex rounded-lg border border-outline-variant bg-surface-container-low p-1">
          {(['actual', 'current'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAccount(a)}
              className={`rounded-md px-4 py-1.5 text-body-md font-medium capitalize transition-colors ${
                account === a
                  ? 'bg-surface-bright text-primary shadow-sm'
                  : 'text-on-surface-variant'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <p className="mt-1 text-label-caps text-on-surface-variant">
          Two valuations of the same goods — Actual is the real figures, Current is the invoiced
          figures.
        </p>
      </div>

      {/* Headline */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
        {headline ? (
          <BalanceHeadline balance={headline} />
        ) : (
          <p className="text-on-surface-variant">Loading…</p>
        )}
      </div>

      {/* Entries */}
      {ledger === null ? (
        <p className="py-6 text-center text-on-surface-variant">Loading…</p>
      ) : ledger.entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant py-10 text-center text-on-surface-variant">
          No entries on this account yet.
        </div>
      ) : (
        <ul className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          {ledger.entries.map((e) => {
            const isDebit = e.debitPaise > 0;
            const delta = isDebit ? e.debitPaise : e.creditPaise;
            return (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-surface-container px-2 py-0.5 text-label-caps uppercase text-on-surface-variant">
                      {e.label}
                    </span>
                    <span className="truncate text-body-md text-on-surface-variant">
                      {e.description}
                    </span>
                  </span>
                  <span className="text-label-caps text-on-surface-variant">
                    {fmtDate(e.entryDate)}
                  </span>
                </span>
                <span className="text-right">
                  <span
                    className={`block font-medium ${isDebit ? 'text-positive' : 'text-negative'}`}
                  >
                    {isDebit ? '+' : '−'}
                    <MoneyDisplay paise={delta} />
                  </span>
                  <span className="text-label-caps text-on-surface-variant">
                    <InlineBalance balancePaise={e.runningBalancePaise} />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {modal === 'money' && (
        <AddMoneyForm dealerId={dealerId} onClose={() => setModal(null)} onDone={afterWrite} />
      )}
      {modal === 'txn' && (
        <AddTransactionForm
          dealerId={dealerId}
          defaultMode="sale"
          onClose={() => setModal(null)}
          onDone={afterWrite}
        />
      )}
    </div>
  );
}
