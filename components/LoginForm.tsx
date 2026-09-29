'use client';

import { DEMO_ACCOUNTS } from '@/lib/demo-accounts';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState<string>(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn(nextEmail: string, nextPassword: string) {
    setEmail(nextEmail);
    setPassword(nextPassword);
    setPending(true);
    setError(null);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: nextEmail, password: nextPassword }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setPending(false);
      setError(body?.error ?? 'Could not sign in.');
      return;
    }
    router.push('/docs');
    router.refresh();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void signIn(email, password);
  }

  return (
    <main className="login-screen">
      <section className="login-copy">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <span className="brand-name">Ajaia Docs</span>
        </div>
        <h1>Write together, without the extra product.</h1>
        <p>
          Create a document, format it, import a text file, and share it with one other person. Two
          reviewer accounts are ready below.
        </p>
      </section>
      <section className="login-card">
        <h2>Sign in</h2>
        <form onSubmit={onSubmit}>
          <label className="field">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary" type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="accounts">
          <p>Reviewer accounts</p>
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.id}
              type="button"
              className="account"
              disabled={pending}
              onClick={() => void signIn(account.email, account.password)}
            >
              <strong>{account.name}</strong>
              <span>
                {account.email} · {account.password}
              </span>
              <span>{account.hint}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
