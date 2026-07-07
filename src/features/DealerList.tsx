import { useEffect, useState } from 'react';
import { ChevronRight, Plus, Search, Users } from 'lucide-react';
import { listDealers, type DealerListItem } from '../lib/api';
import { InlineBalance } from '../components/money';
import { NewDealerForm } from './forms';

export function DealerList({
  activity,
  onOpen,
}: {
  activity: 'all' | 'purchase' | 'sale';
  onOpen: (id: number) => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<DealerListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    const t = setTimeout(() => {
      listDealers(activity, q)
        .then((r) => !cancelled && setItems(r.dealers))
        .catch((e) => !cancelled && setError((e as Error).message));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activity, q, reloadKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2.5 pl-10 pr-3 outline-none focus:ring-2 focus:ring-primary"
            placeholder="Search dealers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-label-caps font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          <Plus size={18} /> New dealer
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-negative-container p-3 text-body-md text-on-negative-container">
          {error}
        </p>
      )}

      {items === null && !error && (
        <p className="py-8 text-center text-on-surface-variant">Loading…</p>
      )}

      {items?.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-outline-variant py-12 text-center">
          <Users size={28} className="text-on-surface-variant" />
          <p className="text-body-md text-on-surface-variant">
            No dealers yet. Add your first one.
          </p>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          {items.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onOpen(d.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container text-body-md font-semibold">
                  {d.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-on-surface">{d.name}</span>
                  <InlineBalance balancePaise={d.actualBalancePaise} />
                </span>
                <ChevronRight size={18} className="shrink-0 text-on-surface-variant" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showNew && (
        <NewDealerForm
          onClose={() => setShowNew(false)}
          onDone={() => {
            setShowNew(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
