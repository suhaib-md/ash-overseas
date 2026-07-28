import { useState, type FormEvent, type ReactNode } from 'react';
import { UserCog, KeyRound, LogOut, AlertTriangle } from 'lucide-react';
import { changePassword, changeUsername, logout } from '../lib/api';
import { useToast } from '../components/Toast';

export function Account({
  username,
  authRequired,
  onUsernameChanged,
}: {
  username: string;
  /** False when AUTH_SECRET is unset (local dev): there is no session to log out of. */
  authRequired: boolean;
  onUsernameChanged: (next: string) => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-headline-md text-on-surface">Account</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {authRequired && username ? (
            <>
              Signed in as <span className="font-semibold text-on-surface">{username}</span>. Changes
              take effect immediately.
            </>
          ) : (
            'Manage the stored login credentials.'
          )}
        </p>
      </header>

      {!authRequired && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-4 text-body-md text-on-surface-variant"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            The login gate is <strong className="text-on-surface">off</strong> in this environment
            because <code>AUTH_SECRET</code> is not set — so there is no session to log out of. Set
            it in <code>.dev.vars</code> (local) or as a Worker secret (production) to require a
            login. The changes below still update the stored credentials.
          </span>
        </p>
      )}

      <UsernameCard current={username} onChanged={onUsernameChanged} />
      <PasswordCard />

      {authRequired && (
        <button
          type="button"
          onClick={async () => {
            await logout();
            location.reload();
          }}
          className="flex items-center gap-2 text-body-md font-medium text-negative hover:underline"
        >
          <LogOut size={16} />
          Log out
        </button>
      )}
    </div>
  );
}

function UsernameCard({
  current,
  onChanged,
}: {
  current: string;
  onChanged: (next: string) => void;
}) {
  const toast = useToast();
  const [newUsername, setNewUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await changeUsername(currentPassword, newUsername);
      onChanged(saved);
      setNewUsername('');
      setCurrentPassword('');
      toast('Username updated');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card icon={<UserCog size={18} />} title="Change username">
      <form onSubmit={submit} className="space-y-4">
        <Field
          id="new-username"
          label="New username"
          type="text"
          autoComplete="username"
          value={newUsername}
          onChange={setNewUsername}
          placeholder={current}
        />
        <Field
          id="username-current-password"
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        {error && (
          <p role="alert" className="text-body-md text-negative">
            {error}
          </p>
        )}
        <SubmitButton busy={busy} disabled={newUsername === '' || currentPassword === ''}>
          Update username
        </SubmitButton>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm !== '' && newPassword !== confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('New passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      toast('Password updated');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card icon={<KeyRound size={18} />} title="Change password">
      <form onSubmit={submit} className="space-y-4">
        <Field
          id="password-current"
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <Field
          id="password-new"
          label="New password (min 8 characters)"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
        />
        <Field
          id="password-confirm"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
        />
        {(error || mismatch) && (
          <p role="alert" className="text-body-md text-negative">
            {error ?? 'New passwords do not match'}
          </p>
        )}
        <SubmitButton
          busy={busy}
          disabled={currentPassword === '' || newPassword === '' || confirm === '' || mismatch}
        >
          Update password
        </SubmitButton>
      </form>
    </Card>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 lg:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-headline-sm text-on-surface">
        <span className="text-on-surface-variant">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label htmlFor={id} className="block space-y-1">
      <span className="text-label-caps uppercase text-on-surface-variant">{label}</span>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  );
}

function SubmitButton({
  busy,
  disabled,
  children,
}: {
  busy: boolean;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="rounded-lg bg-primary px-5 py-2.5 text-label-caps font-semibold uppercase text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {busy ? 'Saving…' : children}
    </button>
  );
}
