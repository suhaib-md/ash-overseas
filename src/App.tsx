import { useEffect, useState } from 'react';
import {
  Landmark,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { formatPaise } from '../shared/format';

type Health = { ok: boolean; service: string; time: string };

export function App() {
  const [status, setStatus] = useState('checking…');
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json() as Promise<Health>)
      .then((d) => {
        if (cancelled) return;
        setOk(d.ok);
        setStatus(d.ok ? 'API OK' : 'API not-ok');
      })
      .catch(() => {
        if (cancelled) return;
        setOk(false);
        setStatus('API unreachable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <header className="border-b border-outline-variant bg-surface-bright">
        <div className="mx-auto flex max-w-lg items-center gap-sm px-md py-md">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-on-primary">
            <Landmark size={22} />
          </span>
          <div>
            <h1 className="text-headline-sm text-primary">ASH Overseas</h1>
            <p className="text-label-caps uppercase text-on-surface-variant">Trading Ledger</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-md px-md py-lg">
        <p className="text-body-md text-on-surface-variant">
          Phase 0 scaffold · design system online.
        </p>

        {/* Wiring checks */}
        <section className="space-y-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
          <Row label="Worker">
            <span
              className={`inline-flex items-center gap-xs text-body-md font-medium ${
                ok === false ? 'text-negative' : 'text-positive'
              }`}
            >
              {ok === false ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
              {status}
            </span>
          </Row>
          <Row label="Money core">
            <span className="tnum text-headline-md text-primary">{formatPaise(12345678)}</span>
          </Row>
        </section>

        {/* Balance-direction reference: colour + icon + words, never colour alone. */}
        <section className="space-y-sm">
          <p className="text-label-caps uppercase text-on-surface-variant">Balance states</p>
          <BalanceSwatch tone="positive" label="Dealer owes you" paise={8249800} />
          <BalanceSwatch tone="negative" label="You owe dealer" paise={11750200} />
          <BalanceSwatch tone="neutral" label="Settled" paise={0} />
        </section>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-label-caps uppercase text-on-surface-variant">{label}</span>
      {children}
    </div>
  );
}

function BalanceSwatch({
  tone,
  label,
  paise,
}: {
  tone: 'positive' | 'negative' | 'neutral';
  label: string;
  paise: number;
}) {
  const styles = {
    positive: { box: 'bg-positive-container text-on-positive-container', Icon: ArrowUpRight },
    negative: { box: 'bg-negative-container text-on-negative-container', Icon: ArrowDownRight },
    neutral: { box: 'bg-secondary-container text-on-secondary-container', Icon: Minus },
  }[tone];
  const Icon = styles.Icon;

  return (
    <div className={`flex items-center justify-between rounded-xl px-md py-md ${styles.box}`}>
      <span className="inline-flex items-center gap-sm text-body-md font-medium">
        <Icon size={18} />
        {label}
      </span>
      <span className="tnum text-headline-sm font-bold">{formatPaise(paise)}</span>
    </div>
  );
}
