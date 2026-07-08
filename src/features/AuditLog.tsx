import { useEffect, useState } from 'react';
import { ChevronDown, ScrollText } from 'lucide-react';
import { getAudit, type AuditEntry } from '../lib/api';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const actionTone = (a: string) =>
  a === 'void'
    ? 'bg-negative-container text-on-negative-container'
    : 'bg-surface-container text-on-surface-variant';

const pretty = (json: string | null) => {
  if (!json) return '';
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
};

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    getAudit()
      .then((r) => setEntries(r.entries))
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-headline-md text-primary">
          <ScrollText size={22} /> Audit log
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Every create, void, and edit — append-only, newest first.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-negative-container p-3 text-body-md text-on-negative-container">
          {error}
        </p>
      )}
      {entries === null && !error && (
        <p className="py-8 text-center text-on-surface-variant">Loading…</p>
      )}
      {entries?.length === 0 && (
        <div className="rounded-xl border border-dashed border-outline-variant py-12 text-center text-on-surface-variant">
          No audited actions yet.
        </div>
      )}

      {entries && entries.length > 0 && (
        <ul className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setOpen(open === e.id ? null : e.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container"
              >
                <span
                  className={`rounded-full px-2 py-0.5 text-label-caps uppercase ${actionTone(e.action)}`}
                >
                  {e.action}
                </span>
                <span className="min-w-0 flex-1 truncate text-body-md text-on-surface">
                  {e.entity}
                  {e.entityId != null ? ` #${e.entityId}` : ''}
                </span>
                <span className="shrink-0 text-label-caps text-on-surface-variant">
                  {fmt(e.at)}
                </span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-on-surface-variant transition-transform ${open === e.id ? 'rotate-180' : ''}`}
                />
              </button>
              {open === e.id && (
                <div className="grid gap-3 border-t border-outline-variant bg-surface-container-low px-4 py-3 sm:grid-cols-2">
                  <div>
                    <p className="text-label-caps uppercase text-on-surface-variant">Before</p>
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-container-lowest p-2 text-[12px]">
                      {pretty(e.beforeJson) || '—'}
                    </pre>
                  </div>
                  <div>
                    <p className="text-label-caps uppercase text-on-surface-variant">After</p>
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-container-lowest p-2 text-[12px]">
                      {pretty(e.afterJson) || '—'}
                    </pre>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
