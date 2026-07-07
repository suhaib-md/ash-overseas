import { useEffect, useState } from 'react';
import { formatPaise } from '../shared/format';

type Health = { ok: boolean; service: string; time: string };

export function App() {
  const [status, setStatus] = useState('checking API…');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json() as Promise<Health>)
      .then((d) => {
        if (!cancelled) setStatus(d.ok ? `API OK · ${d.service}` : 'API returned not-ok');
      })
      .catch(() => {
        if (!cancelled) setStatus('API unreachable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="shell">
      <h1>ASH Overseas</h1>
      <p className="tagline">Trading Ledger — Phase 0 scaffold</p>
      <dl className="checks">
        <dt>Worker</dt>
        <dd>{status}</dd>
        <dt>Money core</dt>
        <dd>{formatPaise(12345678)} (expected ₹1,23,456.78)</dd>
      </dl>
    </main>
  );
}
