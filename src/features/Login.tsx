import { useState, type FormEvent } from 'react';
import { Landmark } from 'lucide-react';
import { login } from '../lib/api';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-surface px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-outline-variant bg-surface-container-lowest p-6"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-on-primary">
            <Landmark size={22} />
          </span>
          <div>
            <p className="text-headline-sm text-primary">ASH Overseas</p>
            <p className="text-label-caps uppercase text-on-surface-variant">Trading Ledger</p>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-label-caps uppercase text-on-surface-variant">Password</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary"
          />
        </label>

        {error && <p className="text-body-md text-negative">{error}</p>}

        <button
          type="submit"
          disabled={busy || password === ''}
          className="w-full rounded-lg bg-primary py-3 text-label-caps font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
