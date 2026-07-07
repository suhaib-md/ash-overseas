import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { AppShell, type NavId } from './components/AppShell';
import { formatPaise } from '../shared/format';

type Health = { ok: boolean; service: string; time: string };

const TITLES: Record<NavId, string> = {
  home: 'Home',
  purchase: 'Purchase',
  sale: 'Sale',
  dealers: 'Dealers',
};

export function App() {
  const [active, setActive] = useState<NavId>('home');
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
    <AppShell active={active} onNavigate={setActive} title={TITLES[active]}>
      {active === 'home' ? (
        <HomeView status={status} ok={ok} />
      ) : (
        <ComingSoon title={TITLES[active]} />
      )}
    </AppShell>
  );
}

function HomeView({ status, ok }: { status: string; ok: boolean | null }) {
  return (
    <div className="space-y-6">
      <p className="text-body-md text-on-surface-variant">
        Phase 0 scaffold · design system online.
      </p>

      {/* Wiring checks — spread across the width on desktop */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Worker">
          <span
            className={`inline-flex items-center gap-2 text-body-lg font-medium ${
              ok === false ? 'text-negative' : 'text-positive'
            }`}
          >
            {ok === false ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            {status}
          </span>
        </Card>
        <Card label="Money core">
          <span className="tnum text-headline-md text-primary">{formatPaise(12345678)}</span>
        </Card>
      </section>

      {/* Balance-direction reference: colour + icon + words, never colour alone. */}
      <section>
        <h2 className="mb-2 text-label-caps uppercase text-on-surface-variant">Balance states</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          <BalanceSwatch tone="positive" label="Dealer owes you" paise={8249800} />
          <BalanceSwatch tone="negative" label="You owe dealer" paise={11750200} />
          <BalanceSwatch tone="neutral" label="Settled" paise={0} />
        </div>
      </section>
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center rounded-xl border border-dashed border-outline-variant">
      <div className="text-center">
        <p className="text-headline-sm text-primary">{title}</p>
        <p className="mt-1 text-body-md text-on-surface-variant">Wired up in Phase 2.</p>
      </div>
    </div>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <p className="text-label-caps uppercase text-on-surface-variant">{label}</p>
      <p className="mt-2">{children}</p>
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
    <div className={`flex items-center justify-between rounded-xl px-4 py-4 ${styles.box}`}>
      <span className="inline-flex items-center gap-2 text-body-lg font-medium">
        <Icon size={18} />
        {label}
      </span>
      <span className="tnum text-headline-sm font-bold">{formatPaise(paise)}</span>
    </div>
  );
}
