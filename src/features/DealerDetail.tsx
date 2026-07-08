import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, ChevronDown, HandCoins, Plus } from 'lucide-react';
import {
  getDealer,
  getLedger,
  voidSource,
  type AccountBalance,
  type AccountName,
  type Dealer,
  type LedgerEntry,
} from '../lib/api';
import { BalanceHeadline, InlineBalance, MoneyDisplay } from '../components/money';
import { AddMoneyForm, AddTransactionForm, Modal } from './forms';
import { TransactionDetailPanel } from './TransactionDetail';

type VoidTarget = { kind: 'transaction' | 'movement'; id: number; label: string };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function DealerDetail({
  dealerId,
  onBack,
  autoOpen,
}: {
  dealerId: number;
  onBack: () => void;
  autoOpen?: 'txn' | 'money';
}) {
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
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

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
  useEffect(() => {
    if (autoOpen) setModal(autoOpen);
  }, [autoOpen, dealerId]);

  function afterWrite() {
    setModal(null);
    loadHeader();
    loadLedger();
  }

  async function confirmVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidSource(voidTarget.kind, voidTarget.id);
      setVoidTarget(null);
      loadHeader();
      loadLedger();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVoiding(false);
    }
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
            const labelText = e.label === 'adjustment' ? 'reversal' : (e.label ?? '');
            return (
              <li key={e.id} className={e.isVoided ? 'opacity-60' : ''}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-surface-container px-2 py-0.5 text-label-caps uppercase text-on-surface-variant">
                        {labelText}
                      </span>
                      {e.isVoided && (
                        <span className="rounded-full bg-negative-container px-2 py-0.5 text-label-caps uppercase text-on-negative-container">
                          Voided
                        </span>
                      )}
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
                      className={`block font-medium ${
                        e.isVoided
                          ? 'text-on-surface-variant line-through'
                          : isDebit
                            ? 'text-positive'
                            : 'text-negative'
                      }`}
                    >
                      {isDebit ? '+' : '−'}
                      <MoneyDisplay paise={delta} />
                    </span>
                    <span className="text-label-caps text-on-surface-variant">
                      <InlineBalance balancePaise={e.runningBalancePaise} />
                    </span>
                  </span>
                  {e.sourceType === 'transaction' && e.sourceId != null && (
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === e.sourceId ? null : e.sourceId)}
                      className="shrink-0 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container"
                      aria-label="Transaction details"
                    >
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${expanded === e.sourceId ? 'rotate-180' : ''}`}
                      />
                    </button>
                  )}
                  {e.voidable && e.sourceId != null && (
                    <button
                      type="button"
                      onClick={() =>
                        setVoidTarget({
                          kind: e.sourceType as 'transaction' | 'movement',
                          id: e.sourceId!,
                          label: `${labelText} ${e.description ?? ''}`.trim(),
                        })
                      }
                      className="shrink-0 rounded-lg p-2 text-on-surface-variant hover:bg-negative-container hover:text-on-negative-container"
                      aria-label="Void entry"
                      title="Void"
                    >
                      <Ban size={16} />
                    </button>
                  )}
                </div>
                {e.sourceType === 'transaction' &&
                  e.sourceId != null &&
                  expanded === e.sourceId && <TransactionDetailPanel transactionId={e.sourceId} />}
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

      {voidTarget && (
        <Modal title="Void this entry?" onClose={() => !voiding && setVoidTarget(null)}>
          <div className="space-y-4">
            <p className="text-body-md text-on-surface-variant">
              This posts an equal-and-opposite <strong>reversing entry</strong> on both accounts and
              marks the original as voided. Nothing is deleted — the original stays for the record.
            </p>
            {error && <p className="text-body-md text-negative">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                disabled={voiding}
                className="flex-1 rounded-lg border border-outline-variant py-2.5 font-semibold hover:bg-surface-container disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmVoid}
                disabled={voiding}
                className="flex-1 rounded-lg bg-negative py-2.5 font-semibold text-on-negative hover:opacity-90 disabled:opacity-50"
              >
                {voiding ? 'Voiding…' : 'Void entry'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
