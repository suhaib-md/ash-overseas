import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { listDealers, type DealerListItem } from '../lib/api';
import { InlineBalance } from '../components/money';
import { Modal } from './forms';

/** Pick a dealer (e.g. before starting a new transaction). */
export function DealerPicker({
  onPick,
  onClose,
}: {
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<DealerListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listDealers('all', q)
        .then((r) => !cancelled && setItems(r.dealers))
        .catch((e) => !cancelled && setError((e as Error).message));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <Modal title="Select a dealer" onClose={onClose}>
      <div className="space-y-3">
        <input
          autoFocus
          className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary"
          placeholder="Search dealers…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {error && <p className="text-body-md text-negative">{error}</p>}
        {items === null && !error && (
          <p className="py-6 text-center text-on-surface-variant">Loading…</p>
        )}
        {items?.length === 0 && (
          <p className="py-6 text-center text-on-surface-variant">No dealers found.</p>
        )}
        {items && items.length > 0 && (
          <ul className="max-h-[50dvh] divide-y divide-outline-variant overflow-y-auto rounded-lg border border-outline-variant">
            {items.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onPick(d.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-container"
                >
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
      </div>
    </Modal>
  );
}
