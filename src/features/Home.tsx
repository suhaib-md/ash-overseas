import { useNavigate } from 'react-router';
import { ShoppingCart, Tag } from 'lucide-react';
import { DealerList } from './DealerList';

export function Home() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => navigate('/purchase')}
          className="flex items-center justify-between rounded-xl bg-primary p-5 text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
        >
          <span className="text-left">
            <span className="block text-label-caps uppercase opacity-70">Record a</span>
            <span className="text-headline-md font-bold">Purchase</span>
          </span>
          <ShoppingCart size={28} />
        </button>
        <button
          type="button"
          onClick={() => navigate('/sale')}
          className="flex items-center justify-between rounded-xl border-2 border-primary p-5 text-primary transition-all hover:bg-surface-container active:scale-[0.98]"
        >
          <span className="text-left">
            <span className="block text-label-caps uppercase opacity-70">Record a</span>
            <span className="text-headline-md font-bold">Sale</span>
          </span>
          <Tag size={28} />
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-label-caps uppercase text-on-surface-variant">Dealers</h2>
        <DealerList activity="all" onOpen={(id) => navigate(`/dealers/${id}`)} />
      </section>
    </div>
  );
}
