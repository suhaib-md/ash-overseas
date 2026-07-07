import { type ReactNode } from 'react';
import { Landmark, Home, ShoppingCart, Tag, Users, Plus, type LucideIcon } from 'lucide-react';

export type NavId = 'home' | 'purchase' | 'sale' | 'dealers';

const NAV: { id: NavId; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'purchase', label: 'Purchase', icon: ShoppingCart },
  { id: 'sale', label: 'Sale', icon: Tag },
  { id: 'dealers', label: 'Dealers', icon: Users },
];

/**
 * Responsive application shell.
 *  - Desktop (lg+): persistent left sidebar + wide content area — a native web app.
 *  - Mobile: top bar with brand + a thumb-reachable bottom tab bar — a native mobile app.
 * Navigation is local state for now (chrome only); real routing arrives in Phase 2.
 */
export function AppShell({
  active,
  onNavigate,
  title,
  children,
}: {
  active: NavId;
  onNavigate: (id: NavId) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-surface text-on-surface">
      {/* Sidebar — desktop only */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-outline-variant bg-surface-bright lg:flex">
        <div className="p-6">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <SideLink
              key={item.id}
              item={item}
              active={active === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>
        <div className="p-3">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-label-caps font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <Plus size={18} />
            New Transaction
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Top app bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-bright px-4 lg:px-8">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <h1 className="hidden text-headline-sm text-primary lg:block">{title}</h1>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-caps font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">New</span>
          </button>
        </header>

        {/* Page content — fills the available width */}
        <main className="flex-1 p-4 pb-24 lg:p-8 lg:pb-8">{children}</main>

        {/* Bottom tab bar — mobile only */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-outline-variant bg-surface-bright lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {NAV.map((item) => (
            <TabLink
              key={item.id}
              item={item}
              active={active === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>
      </div>
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

function SideLink({
  item,
  active,
  onClick,
}: {
  item: { label: string; icon: LucideIcon };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-body-md transition-colors ${
        active
          ? 'bg-surface-container font-semibold text-primary'
          : 'font-medium text-on-surface-variant hover:bg-surface-container-low'
      }`}
    >
      <Icon size={20} />
      {item.label}
    </button>
  );
}

function TabLink({
  item,
  active,
  onClick,
}: {
  item: { label: string; icon: LucideIcon };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center gap-1 py-2 text-[11px] transition-colors ${
        active ? 'font-semibold text-primary' : 'font-medium text-on-surface-variant'
      }`}
    >
      <span
        className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${
          active ? 'bg-surface-container-high' : ''
        }`}
      >
        <Icon size={21} />
      </span>
      {item.label}
    </button>
  );
}
