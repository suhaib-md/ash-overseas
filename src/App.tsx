import { useState } from 'react';
import { AppShell, type NavId } from './components/AppShell';
import { DealerList } from './features/DealerList';
import { DealerDetail } from './features/DealerDetail';

const TITLES: Record<NavId, string> = {
  home: 'Home',
  purchase: 'Purchase',
  sale: 'Sale',
  dealers: 'Dealers',
};
const ACTIVITY: Record<NavId, 'all' | 'purchase' | 'sale'> = {
  home: 'all',
  purchase: 'purchase',
  sale: 'sale',
  dealers: 'all',
};

export function App() {
  const [nav, setNav] = useState<NavId>('home');
  const [dealerId, setDealerId] = useState<number | null>(null);

  function navigate(id: NavId) {
    setNav(id);
    setDealerId(null);
  }

  return (
    <AppShell active={nav} onNavigate={navigate} title={dealerId != null ? 'Dealer' : TITLES[nav]}>
      {dealerId != null ? (
        <DealerDetail dealerId={dealerId} onBack={() => setDealerId(null)} />
      ) : (
        <DealerList activity={ACTIVITY[nav]} onOpen={setDealerId} />
      )}
    </AppShell>
  );
}
