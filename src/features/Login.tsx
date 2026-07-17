import { useState, type FormEvent, type ReactNode } from 'react';
import { Landmark, User, Lock, ArrowRight } from 'lucide-react';
import { login } from '../lib/api';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel — full-bleed on desktop, a compact header on mobile */}
      <aside className="relative flex flex-col justify-between overflow-hidden bg-primary px-6 py-8 text-on-primary lg:px-12 lg:py-12">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-on-primary/10 ring-1 ring-on-primary/15">
            <Landmark size={24} />
          </span>
          <div>
            <p className="text-headline-sm leading-none">ASH Overseas</p>
            <p className="mt-1 text-label-caps uppercase text-on-primary/60">Trading Ledger</p>
          </div>
        </div>

        <div className="hidden max-w-md lg:block">
          <h1 className="text-display-lg">Your ledger, always in balance.</h1>
          <p className="mt-4 text-body-lg text-on-primary/70">
            Dual-valuation records of every shipment and every rupee moved — one consolidated
            balance per dealer. Private, and only ever a hash away from your password.
          </p>
        </div>

        <p className="hidden text-label-caps uppercase text-on-primary/40 lg:block">
          Authorised access only
        </p>

        {/* soft decorative glow */}
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-on-primary/5 blur-2xl" />
      </aside>

      {/* Sign-in form */}
      <main className="flex items-center justify-center bg-surface px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-headline-md text-on-surface">Sign in</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Enter your credentials to open the ledger.
          </p>

          <div className="mt-8 space-y-4">
            <Field
              id="username"
              label="Username"
              icon={<User size={18} />}
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={setUsername}
            />
            <Field
              id="password"
              label="Password"
              icon={<Lock size={18} />}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 text-body-md text-negative">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || username === '' || password === ''}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-label-caps font-semibold uppercase text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  icon,
  type,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-label-caps uppercase text-on-surface-variant">{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-bright px-3 focus-within:ring-2 focus-within:ring-primary">
        <span className="text-on-surface-variant">{icon}</span>
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent py-2.5 outline-none"
        />
      </div>
    </label>
  );
}
