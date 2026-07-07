import { useId, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatPaise, parseRupeesToPaise } from '../../shared/format';
import { describeBalance } from '../../shared/ledger';
import type { AccountBalance } from '../lib/api';

/** Render integer paise as ₹ with tabular figures. Never format money any other way. */
export function MoneyDisplay({ paise, className = '' }: { paise: number; className?: string }) {
  return <span className={`tnum ${className}`}>{formatPaise(paise)}</span>;
}

/** The plain-language balance headline (colour + icon + words — never colour alone). */
export function BalanceHeadline({ balance }: { balance: AccountBalance }) {
  if (balance.state === 'settled') {
    return (
      <div className="flex items-center gap-2 text-neutral">
        <Minus size={20} />
        <span className="text-headline-sm">Settled</span>
      </div>
    );
  }
  const owes = balance.state === 'owes_you';
  const tone = owes ? 'text-positive' : 'text-negative';
  const Icon = owes ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={`space-y-1 ${tone}`}>
      <div className="flex items-center gap-2 text-label-caps uppercase">
        <Icon size={18} />
        {owes ? 'Dealer owes you' : 'You owe dealer'}
      </div>
      <MoneyDisplay paise={balance.magnitudePaise} className="text-display-lg font-bold" />
    </div>
  );
}

/** Compact inline balance for list rows. */
export function InlineBalance({ balancePaise }: { balancePaise: number }) {
  const { state, magnitudePaise } = describeBalance(balancePaise);
  if (state === 'settled') return <span className="text-body-md text-neutral">Settled</span>;
  const owes = state === 'owes_you';
  return (
    <span
      className={`inline-flex items-center gap-1 text-body-md font-medium ${owes ? 'text-positive' : 'text-negative'}`}
    >
      {owes ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
      <MoneyDisplay paise={magnitudePaise} />
    </span>
  );
}

/**
 * Rupee input that emits integer paise (never a float). Holds the raw string locally;
 * calls onChange(paise|null) as it parses. Shows the parsed value on blur for confidence.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  allowNegative = false,
  required = false,
}: {
  label: string;
  value: number | null;
  onChange: (paise: number | null) => void;
  allowNegative?: boolean;
  required?: boolean;
}) {
  const id = useId();
  const [raw, setRaw] = useState(value == null ? '' : formatPaise(value).replace(/^₹\s?/, ''));
  const [error, setError] = useState<string | null>(null);

  function handle(next: string) {
    setRaw(next);
    if (next.trim() === '') {
      setError(required ? 'Required' : null);
      onChange(null);
      return;
    }
    try {
      const paise = parseRupeesToPaise(next);
      if (!allowNegative && paise < 0) {
        setError('Must be ≥ 0');
        onChange(null);
        return;
      }
      setError(null);
      onChange(paise);
    } catch {
      setError('Enter a valid amount');
      onChange(null);
    }
  }

  return (
    <label htmlFor={id} className="block space-y-1">
      <span className="text-label-caps uppercase text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 focus-within:ring-2 focus-within:ring-primary">
        <span className="text-on-surface-variant">₹</span>
        <input
          id={id}
          inputMode="decimal"
          className="tnum w-full bg-transparent py-2.5 outline-none"
          value={raw}
          onChange={(e) => handle(e.target.value)}
          onBlur={() => value != null && setRaw(formatPaise(value).replace(/^₹\s?/, ''))}
          placeholder="0.00"
        />
      </div>
      {error && <span className="text-label-caps text-negative">{error}</span>}
    </label>
  );
}
