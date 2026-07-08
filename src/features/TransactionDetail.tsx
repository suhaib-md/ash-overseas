import { useEffect, useState, type ReactNode } from 'react';
import { getTransaction, type TransactionDetail } from '../lib/api';
import { MoneyDisplay } from '../components/money';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** Expanded per-transaction detail: lines + GST split (CGST/SGST vs IGST) + round-off. */
export function TransactionDetailPanel({ transactionId }: { transactionId: number }) {
  const [d, setD] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTransaction(transactionId)
      .then((r) => !cancelled && setD(r.transaction))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  if (error)
    return (
      <div className="border-t border-outline-variant px-4 py-3 text-body-md text-negative">
        {error}
      </div>
    );
  if (!d)
    return (
      <div className="border-t border-outline-variant px-4 py-3 text-label-caps text-on-surface-variant">
        Loading…
      </div>
    );

  const t = d.totals;
  const taxLabel =
    d.taxType === 'intra' ? 'Intra-state' : d.taxType === 'inter' ? 'Inter-state' : 'No GST';

  return (
    <div className="space-y-3 border-t border-outline-variant bg-surface-container-low px-4 py-3 text-body-md">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-on-surface-variant">
        <span className="font-medium text-on-surface">{d.humanId}</span>
        <span>Tax: {taxLabel}</span>
        {d.invoiceNo && (
          <span>
            Invoice {d.invoiceNo}
            {d.invoiceDate ? ` · ${fmtDate(d.invoiceDate)}` : ''}
          </span>
        )}
        {d.isCreditDebitNote && <span className="text-negative">Credit / debit note</span>}
      </div>

      <ul className="space-y-1">
        {d.lines.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">
              {l.itemName} — {l.quantity}
              {l.unit ? ` ${l.unit}` : ''} {l.gstRate ? `· ${l.gstRate}% GST` : ''}
            </span>
            <span className="tnum shrink-0 text-on-surface-variant">
              act <MoneyDisplay paise={l.actualAmountPaise} /> · cur{' '}
              <MoneyDisplay paise={l.currentAmountPaise} />
            </span>
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t border-outline-variant pt-2">
        <Line label="Taxable value (current)">
          <MoneyDisplay paise={t.currentGoodsPaise} />
        </Line>
        {t.discountPaise > 0 && (
          <Line label="Discount">
            −<MoneyDisplay paise={t.discountPaise} />
          </Line>
        )}
        {t.freightPaise > 0 && (
          <Line label="Freight">
            <MoneyDisplay paise={t.freightPaise} />
          </Line>
        )}
        {d.taxType === 'intra' && (
          <>
            <Line label="CGST">
              <MoneyDisplay paise={t.cgstPaise} />
            </Line>
            <Line label="SGST">
              <MoneyDisplay paise={t.sgstPaise} />
            </Line>
          </>
        )}
        {d.taxType === 'inter' && (
          <Line label="IGST">
            <MoneyDisplay paise={t.igstPaise} />
          </Line>
        )}
        {d.taxType !== 'none' && (
          <Line label="Total GST">
            <MoneyDisplay paise={t.gstPaise} />
          </Line>
        )}
        {t.roundOffPaise !== 0 && (
          <Line label="Round-off">
            <MoneyDisplay paise={t.roundOffPaise} />
          </Line>
        )}
        <Line label="Invoice total (current)">
          <span className="font-semibold text-on-surface">
            <MoneyDisplay paise={t.currentPostedPaise} />
          </span>
        </Line>
        <Line label="Actual total">
          <span className="font-semibold text-on-surface">
            <MoneyDisplay paise={t.actualPostedPaise} />
          </span>
        </Line>
      </div>

      {d.notes && <p className="text-on-surface-variant">Notes: {d.notes}</p>}
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-on-surface-variant">{label}</span>
      <span className="tnum">{children}</span>
    </div>
  );
}
