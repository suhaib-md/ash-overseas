import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ShellLayout } from './components/AppShell';
import { Home } from './features/Home';
import { DealerList } from './features/DealerList';
import { DealerDetail } from './features/DealerDetail';
import { AuditLog } from './features/AuditLog';
import { Account } from './features/Account';
import { Login } from './features/Login';
import { authMe, logout, setUnauthorizedHandler } from './lib/api';

export function App() {
  const [status, setStatus] = useState<'loading' | 'authed' | 'login'>('loading');
  const [username, setUsername] = useState('');
  const [authRequired, setAuthRequired] = useState(true);
  const navigate = useNavigate();

  const check = useCallback(() => {
    authMe()
      .then((r) => {
        setUsername(r.username ?? '');
        setAuthRequired(r.required);
        setStatus(r.authenticated ? 'authed' : 'login');
      })
      .catch(() => setStatus('login'));
  }, []);

  // The login screen renders over whatever URL is in the address bar, so without
  // this a fresh sign-in would land on that stale path (e.g. /account) instead of Home.
  const onLoggedIn = useCallback(() => {
    navigate('/', { replace: true });
    check();
  }, [navigate, check]);

  // Reset the URL too — a plain reload would keep the page you logged out from
  // (e.g. /account) in the address bar behind the login screen.
  const onLogout = useCallback(async () => {
    await logout();
    setUsername('');
    navigate('/', { replace: true });
    setStatus('login');
  }, [navigate]);

  useEffect(() => {
    // Session expired mid-use: same treatment, so the login screen never sits on
    // top of a stale path.
    setUnauthorizedHandler(() => {
      navigate('/', { replace: true });
      setStatus('login');
    });
    check();
  }, [check, navigate]);

  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface text-on-surface-variant">
        Loading…
      </div>
    );
  }
  if (status === 'login') return <Login onSuccess={onLoggedIn} />;

  return (
    <Routes>
      <Route element={<ShellLayout username={username} />}>
        <Route path="/" element={<Home />} />
        <Route path="/purchase" element={<DealerListPage activity="purchase" />} />
        <Route path="/sale" element={<DealerListPage activity="sale" />} />
        <Route path="/dealers" element={<DealerListPage activity="all" />} />
        <Route path="/dealers/:id" element={<DealerDetailPage />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route
          path="/account"
          element={
            <Account
              username={username}
              authRequired={authRequired}
              onUsernameChanged={setUsername}
              onLogout={onLogout}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function DealerListPage({ activity }: { activity: 'all' | 'purchase' | 'sale' }) {
  const navigate = useNavigate();
  return <DealerList activity={activity} onOpen={(id) => navigate(`/dealers/${id}`)} />;
}

function DealerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dealerId = Number(id);
  if (!Number.isInteger(dealerId) || dealerId <= 0) return <Navigate to="/dealers" replace />;
  const autoOpen = (location.state as { openTxn?: boolean } | null)?.openTxn ? 'txn' : undefined;
  return <DealerDetail dealerId={dealerId} onBack={() => navigate(-1)} autoOpen={autoOpen} />;
}
