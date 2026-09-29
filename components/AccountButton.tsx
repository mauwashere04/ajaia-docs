'use client';

import type { PublicUser } from '@/lib/types';
import { FormEvent, useState } from 'react';

export function AccountButton({
  user,
  onUserChange,
}: {
  user: PublicUser;
  onUserChange: (user: PublicUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  function toggle() {
    setOpen((current) => !current);
    setName(user.name);
    setEmail(user.email);
    setCurrentPassword('');
    setNewPassword('');
    setError(null);
    setSaved(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const response = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        currentPassword,
        newPassword,
      }),
    });
    const body = (await response.json().catch(() => null)) as { user?: PublicUser; error?: string } | null;
    setPending(false);
    if (!response.ok || !body?.user) {
      setError(body?.error ?? 'Could not update your account.');
      return;
    }
    onUserChange(body.user);
    setName(body.user.name);
    setEmail(body.user.email);
    setCurrentPassword('');
    setNewPassword('');
    setSaved(true);
  }

  return (
    <div className="share-wrap">
      <button type="button" className="user-chip button-chip" onClick={toggle}>
        {user.name}
      </button>
      {open ? (
        <form className="share-panel account-panel" onSubmit={(event) => void onSubmit(event)}>
          <h2>Your account</h2>
          <label className="field">
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
          </label>
          <label className="field">
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="field">
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="field">
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="Leave blank to keep the current one"
            />
          </label>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? <p className="hint">Saved. Use the new email the next time you sign in.</p> : null}
          <button className="primary" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save account'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
