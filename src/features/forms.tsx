import { useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { computeTransaction, type TaxType, type TransactionMode } from '../../shared/ledger';
import { createDealer, createMovement, createTransaction } from '../lib/api';
import { useDraft } from '../lib/useDraft';
import { MoneyDisplay, MoneyInput } from '../components/money';

const today = () => new Date().toISOString().slice(0, 10);

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-surface-bright p-5 sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-headline-sm text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-label-caps uppercase text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary';

function Actions({
  busy,
  error,
  submitLabel,
}: {
  busy: boolean;
  error: string | null;
  submitLabel: string;
}) {
  return (
    <div className="space-y-2 pt-1">
      {error && <p className="text-body-md text-negative">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-primary py-3 text-label-caps font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-on-surface-variant">{label}</span>
      {children}
    </div>
  );
}

// --- New dealer ------------------------------------------------------------

export function NewDealerForm({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'supplier' | 'buyer' | 'both'>('both');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [openingActual, setOpeningActual] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createDealer({
        name,
        type,
        gstin: gstin || null,
        stateCode: stateCode || null,
        openingActualPaise: openingActual ?? undefined,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="New dealer" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Type">
          <select
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="both">Both</option>
            <option value="supplier">Supplier</option>
            <option value="buyer">Buyer</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GSTIN">
            <input className={inputCls} value={gstin} onChange={(e) => setGstin(e.target.value)} />
          </Field>
          <Field label="State code">
            <input
              className={inputCls}
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              placeholder="33"
            />
          </Field>
        </div>
        <MoneyInput
          label="Opening actual balance (+ owes you, − you owe)"
          value={openingActual}
          onChange={setOpeningActual}
          allowNegative
        />
        <Actions busy={busy} error={error} submitLabel="Create dealer" />
      </form>
    </Modal>
  );
}

// --- Add money movement ----------------------------------------------------

interface MoneyDraft {
  direction: 'received' | 'paid';
  amountPaise: number | null;
  accountScope: 'actual' | 'current' | 'both';
  date: string;
  method: string;
  reference: string;
  notes: string;
}

const emptyMoney = (): MoneyDraft => ({
  direction: 'received',
  amountPaise: null,
  accountScope: 'actual',
  date: today(),
  method: '',
  reference: '',
  notes: '',
});

export function AddMoneyForm({
  dealerId,
  onDone,
  onClose,
}: {
  dealerId: number;
  onDone: () => void;
  onClose: () => void;
}) {
  const [d, setD, clearDraft] = useDraft<MoneyDraft>(`draft:money:${dealerId}`, emptyMoney());
  const patch = (p: Partial<MoneyDraft>) => setD((prev) => ({ ...prev, ...p }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (d.amountPaise == null || d.amountPaise <= 0) return setError('Enter an amount');
    setBusy(true);
    setError(null);
    try {
      await createMovement({
        dealerId,
        date: d.date,
        direction: d.direction,
        amountPaise: d.amountPaise,
        accountScope: d.accountScope,
        method: d.method || null,
        reference: d.reference || null,
        notes: d.notes || null,
      });
      clearDraft();
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Add money" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direction">
            <select
              className={inputCls}
              value={d.direction}
              onChange={(e) => patch({ direction: e.target.value as MoneyDraft['direction'] })}
            >
              <option value="received">Received from dealer</option>
              <option value="paid">Paid to dealer</option>
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              max={today()}
              className={inputCls}
              value={d.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </Field>
        </div>
        <MoneyInput
          label="Amount"
          value={d.amountPaise}
          onChange={(v) => patch({ amountPaise: v })}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Applies to">
            <select
              className={inputCls}
              value={d.accountScope}
              onChange={(e) =>
                patch({ accountScope: e.target.value as MoneyDraft['accountScope'] })
              }
            >
              <option value="actual">Actual only</option>
              <option value="current">Current only</option>
              <option value="both">Both</option>
            </select>
          </Field>
          <Field label="Method">
            <select
              className={inputCls}
              value={d.method}
              onChange={(e) => patch({ method: e.target.value })}
            >
              <option value="">—</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="cheque">Cheque</option>
              <option value="upi">UPI</option>
            </select>
          </Field>
        </div>
        <Field label="Reference">
          <input
            className={inputCls}
            value={d.reference}
            onChange={(e) => patch({ reference: e.target.value })}
          />
        </Field>
        <Field label="Notes">
          <input
            className={inputCls}
            value={d.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </Field>
        <Actions busy={busy} error={error} submitLabel="Save money movement" />
      </form>
    </Modal>
  );
}

// --- Add transaction (goods) ----------------------------------------------

interface LineState {
  id: string;
  itemName: string;
  unit: string;
  quantity: string;
  actualRatePaise: number | null;
  currentRatePaise: number | null;
  gstRatePercent: string;
}

interface TxnDraft {
  mode: TransactionMode;
  taxType: TaxType;
  date: string;
  referenceTag: string;
  invoiceNo: string;
  invoiceDate: string;
  discountPaise: number | null;
  freightPaise: number | null;
  isCreditDebitNote: boolean;
  notes: string;
  lines: LineState[];
}

const newLine = (): LineState => ({
  id: crypto.randomUUID(),
  itemName: '',
  unit: '',
  quantity: '',
  actualRatePaise: null,
  currentRatePaise: null,
  gstRatePercent: '18',
});

const emptyTxn = (mode: TransactionMode): TxnDraft => ({
  mode,
  taxType: 'intra',
  date: today(),
  referenceTag: '',
  invoiceNo: '',
  invoiceDate: '',
  discountPaise: null,
  freightPaise: null,
  isCreditDebitNote: false,
  notes: '',
  lines: [newLine()],
});

export function AddTransactionForm({
  dealerId,
  defaultMode,
  onDone,
  onClose,
}: {
  dealerId: number;
  defaultMode: TransactionMode;
  onDone: () => void;
  onClose: () => void;
}) {
  const [d, setD, clearDraft] = useDraft<TxnDraft>(`draft:txn:${dealerId}`, emptyTxn(defaultMode));
  const patch = (p: Partial<TxnDraft>) => setD((prev) => ({ ...prev, ...p }));
  const setLine = (id: string, p: Partial<LineState>) =>
    setD((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) }));
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engineLines = d.lines
    .filter(
      (l) => Number(l.quantity) > 0 && l.actualRatePaise != null && l.currentRatePaise != null,
    )
    .map((l) => ({
      quantity: Number(l.quantity),
      actualRatePaise: l.actualRatePaise as number,
      currentRatePaise: l.currentRatePaise as number,
      gstRatePercent: Number(l.gstRatePercent) || 0,
    }));

  let summary: ReturnType<typeof computeTransaction> | null = null;
  try {
    if (engineLines.length > 0) {
      summary = computeTransaction({
        mode: d.mode,
        taxType: d.taxType,
        lines: engineLines,
        discountPaise: d.discountPaise ?? 0,
        freightPaise: d.freightPaise ?? 0,
      });
    }
  } catch {
    summary = null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payloadLines = d.lines
      .filter((l) => l.itemName.trim() && Number(l.quantity) > 0)
      .map((l) => ({
        itemName: l.itemName.trim(),
        unit: l.unit || null,
        quantity: Number(l.quantity),
        actualRatePaise: l.actualRatePaise ?? 0,
        currentRatePaise: l.currentRatePaise ?? 0,
        gstRatePercent: Number(l.gstRatePercent) || 0,
      }));
    if (payloadLines.length === 0)
      return setError('Add at least one line with an item, quantity and rates');
    setBusy(true);
    setError(null);
    try {
      await createTransaction({
        dealerId,
        date: d.date,
        mode: d.mode,
        taxType: d.taxType,
        referenceTag: d.referenceTag || null,
        invoiceNo: d.invoiceNo || null,
        invoiceDate: d.invoiceDate || null,
        discountPaise: d.discountPaise ?? 0,
        freightPaise: d.freightPaise ?? 0,
        isCreditDebitNote: d.isCreditDebitNote,
        notes: d.notes || null,
        lines: payloadLines,
      });
      clearDraft();
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={d.mode === 'sale' ? 'New sale' : 'New purchase'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Mode">
            <select
              className={inputCls}
              value={d.mode}
              onChange={(e) => patch({ mode: e.target.value as TransactionMode })}
            >
              <option value="sale">Sale</option>
              <option value="purchase">Purchase</option>
            </select>
          </Field>
          <Field label="Tax">
            <select
              className={inputCls}
              value={d.taxType}
              onChange={(e) => patch({ taxType: e.target.value as TaxType })}
            >
              <option value="intra">Intra (CGST+SGST)</option>
              <option value="inter">Inter (IGST)</option>
              <option value="none">None</option>
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              max={today()}
              className={inputCls}
              value={d.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </Field>
        </div>

        {d.lines.map((l, i) => (
          <div key={l.id} className="space-y-2 rounded-lg border border-outline-variant p-3">
            <div className="flex items-center justify-between">
              <span className="text-label-caps uppercase text-on-surface-variant">
                Line {i + 1}
              </span>
              {d.lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => patch({ lines: d.lines.filter((x) => x.id !== l.id) })}
                  className="text-negative"
                  aria-label="Remove line"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputCls}
                placeholder="Item name"
                value={l.itemName}
                onChange={(e) => setLine(l.id, { itemName: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="Qty"
                  value={l.quantity}
                  onChange={(e) => setLine(l.id, { quantity: e.target.value })}
                />
                <input
                  className={inputCls}
                  placeholder="Unit"
                  value={l.unit}
                  onChange={(e) => setLine(l.id, { unit: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MoneyInput
                label="Actual rate"
                value={l.actualRatePaise}
                onChange={(v) => setLine(l.id, { actualRatePaise: v })}
              />
              <MoneyInput
                label="Current rate"
                value={l.currentRatePaise}
                onChange={(v) => setLine(l.id, { currentRatePaise: v })}
              />
              <Field label="GST %">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={l.gstRatePercent}
                  onChange={(e) => setLine(l.id, { gstRatePercent: e.target.value })}
                />
              </Field>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => patch({ lines: [...d.lines, newLine()] })}
          className="inline-flex items-center gap-1 text-body-md font-medium text-primary"
        >
          <Plus size={16} /> Add line
        </button>

        <Field label="Reference tag">
          <input
            className={inputCls}
            value={d.referenceTag}
            onChange={(e) => patch({ referenceTag: e.target.value })}
            placeholder="ASH 39"
          />
        </Field>

        {/* Optional invoice / adjustment fields */}
        <button
          type="button"
          onClick={() => setShowMore((s) => !s)}
          className="inline-flex items-center gap-1 text-body-md font-medium text-on-surface-variant"
        >
          <ChevronDown
            size={16}
            className={showMore ? 'rotate-180 transition-transform' : 'transition-transform'}
          />
          {showMore ? 'Hide' : 'More'} options
        </button>
        {showMore && (
          <div className="space-y-3 rounded-lg bg-surface-container-low p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice no.">
                <input
                  className={inputCls}
                  value={d.invoiceNo}
                  onChange={(e) => patch({ invoiceNo: e.target.value })}
                />
              </Field>
              <Field label="Invoice date">
                <input
                  type="date"
                  max={today()}
                  className={inputCls}
                  value={d.invoiceDate}
                  onChange={(e) => patch({ invoiceDate: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput
                label="Discount"
                value={d.discountPaise}
                onChange={(v) => patch({ discountPaise: v })}
              />
              <MoneyInput
                label="Freight"
                value={d.freightPaise}
                onChange={(v) => patch({ freightPaise: v })}
              />
            </div>
            <label className="flex items-center gap-2 text-body-md">
              <input
                type="checkbox"
                checked={d.isCreditDebitNote}
                onChange={(e) => patch({ isCreditDebitNote: e.target.checked })}
              />
              Credit / debit note (posts in the reversing direction)
            </label>
            <Field label="Notes">
              <input
                className={inputCls}
                value={d.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </Field>
          </div>
        )}

        {summary && (
          <div className="space-y-1 rounded-lg bg-surface-container-low p-3 text-body-md">
            <Row label="Actual total">
              <MoneyDisplay paise={summary.actualPostedPaise} className="font-semibold" />
            </Row>
            <Row label="Current / invoice total">
              <MoneyDisplay paise={summary.currentPostedPaise} className="font-semibold" />
            </Row>
            <Row
              label={d.taxType === 'inter' ? 'IGST' : d.taxType === 'intra' ? 'CGST + SGST' : 'GST'}
            >
              <MoneyDisplay paise={summary.totalGstPaise} />
            </Row>
            {summary.currentRoundOffPaise !== 0 && (
              <Row label="Round-off">
                <MoneyDisplay paise={summary.currentRoundOffPaise} />
              </Row>
            )}
          </div>
        )}

        <Actions busy={busy} error={error} submitLabel={`Save ${d.mode}`} />
      </form>
    </Modal>
  );
}
