import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  Landmark,
  Home,
  ShoppingCart,
  Tag,
  Users,
  Plus,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { DealerPicker } from '../features/DealerPicker';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/purchase', label: 'Purchase', icon: ShoppingCart },
  { to: '/sale', label: 'Sale', icon: Tag },
  { to: '/dealers', label: 'Dealers', icon: Users },
];

function titleFor(pathname: string): string {
  if (pathname === '/') return 'Home';
  if (pathname.startsWith('/purchase')) return 'Purchase';
  if (pathname.startsWith('/sale')) return 'Sale';
  if (pathname.startsWith('/dealers/')) return 'Dealer';
  if (pathname.startsWith('/dealers')) return 'Dealers';
  return '';
}

/**
 * Responsive application shell (route-aware).
 *  - Desktop (lg+): persistent left sidebar + wide content — a native web app.
 *  - Mobile: top bar + thumb-reachable bottom tab bar — a native mobile app.
 */
export function ShellLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pickDealer, setPickDealer] = useState(false);

  // "New transaction" needs a dealer first → pick one, then jump into its detail
  // with the transaction form open.
  function startNewTransaction(dealerId: number) {
    setPickDealer(false);
    navigate(`/dealers/${dealerId}`, { state: { openTxn: true } });
  }

  return (
    <div className="flex min-h-dvh bg-surface text-on-surface">
      {/* Sidebar — desktop only */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-outline-variant bg-surface-bright lg:flex">
        <div className="p-6">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="p-3">
          <button
            type="button"
            onClick={() => setPickDealer(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-label-caps font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <Plus size={18} />
            New Transaction
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-bright px-4 lg:px-8">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <h1 className="hidden text-headline-sm text-primary lg:block">
            {titleFor(location.pathname)}
          </h1>
          <div className="flex items-center gap-2">
            <NavLink
              to="/audit"
              title="Audit log"
              aria-label="Audit log"
              className={({ isActive }) =>
                `rounded-lg p-2 transition-colors ${
                  isActive
                    ? 'bg-surface-container text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container'
                }`
              }
            >
              <ScrollText size={18} />
            </NavLink>
            <button
              type="button"
              onClick={() => setPickDealer(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-caps font-semibold text-on-primary transition-opacity hover:opacity-90"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 lg:p-8 lg:pb-8">
          <Outlet />
        </main>

        {/* Bottom tab bar — mobile only */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-outline-variant bg-surface-bright lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {NAV.map((item) => (
            <TabLink key={item.to} item={item} />
          ))}
        </nav>
      </div>

      {pickDealer && (
        <DealerPicker onPick={startNewTransaction} onClose={() => setPickDealer(false)} />
      )}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-on-primary">
        <Landmark size={compact ? 20 : 22} />
      </span>
      <div>
        <p className="text-headline-sm leading-none text-primary">ASH Overseas</p>
        <p className="mt-1 text-label-caps uppercase text-on-surface-variant">Trading Ledger</p>
      </div>
    </div>
  );
}

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-body-md transition-colors ${
          isActive
            ? 'bg-surface-container font-semibold text-primary'
            : 'font-medium text-on-surface-variant hover:bg-surface-container-low'
        }`
      }
    >
      <Icon size={20} />
      {item.label}
    </NavLink>
  );
}

function TabLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 py-2 text-[11px] transition-colors ${
          isActive ? 'font-semibold text-primary' : 'font-medium text-on-surface-variant'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${
              isActive ? 'bg-surface-container-high' : ''
            }`}
          >
            <Icon size={21} />
          </span>
          {item.label}
        </>
      )}
    </NavLink>
  );
}
