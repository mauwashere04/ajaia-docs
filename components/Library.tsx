'use client';

import { AccountButton } from '@/components/AccountButton';
import { formatUpdated } from '@/lib/format';
import type { PublicUser, Summary } from '@/lib/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useState } from 'react';

export function Library() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [owned, setOwned] = useState<Summary[]>([]);
  const [shared, setShared] = useState<Summary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [meResponse, docsResponse] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/documents'),
      ]);
      if (meResponse.status === 401 || docsResponse.status === 401) {
        router.push('/login');
        return;
      }
      const me = (await meResponse.json()) as { user: PublicUser };
      const docs = (await docsResponse.json()) as { owned: Summary[]; shared: Summary[]; error?: string };
      if (cancelled) return;
      if (!docsResponse.ok) {
        setError(docs.error ?? 'Could not load documents.');
        setLoading(false);
        return;
      }
      setUser(me.user);
      setOwned(docs.owned);
      setShared(docs.shared);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function createDocument() {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled' }),
    });
    const body = (await response.json().catch(() => null)) as { document?: { id: string }; error?: string } | null;
    if (!response.ok || !body?.document) {
      setBusy(false);
      setError(body?.error ?? 'Could not create a document.');
      return;
    }
    router.push(`/docs/${body.document.id}`);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set('file', file);
    const response = await fetch('/api/import', { method: 'POST', body: form });
    const body = (await response.json().catch(() => null)) as { document?: { id: string }; error?: string } | null;
    if (!response.ok || !body?.document) {
      setBusy(false);
      setError(body?.error ?? 'Could not import that file.');
      return;
    }
    router.push(`/docs/${body.document.id}`);
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link href="/docs" className="brand">
          <span className="mark" aria-hidden="true" />
          <span className="brand-name">Ajaia Docs</span>
        </Link>
        <div className="topbar-actions">
          {user ? <AccountButton user={user} onUserChange={setUser} /> : null}
          <button type="button" className="text-button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="page">
        <div className="page-header">
          <div>
            <h1>Documents</h1>
            <p className="lede">Your files stay separate from documents other people have shared with you.</p>
          </div>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void createDocument()} disabled={busy}>
              New document
            </button>
            <label className="file-button">
              Import
              <input
                className="visually-hidden"
                type="file"
                accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => void onFile(event)}
                disabled={busy}
              />
            </label>
          </div>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? <p className="lede">Loading documents…</p> : null}
        <section className="section">
          <h2>Your documents</h2>
          {owned.length === 0 && !loading ? <p className="empty">No documents yet. Create one or import a file.</p> : null}
          <div className="cards">
            {owned.map((doc) => (
              <Link key={doc.id} href={`/docs/${doc.id}`} className="card">
                <h3>{doc.title}</h3>
                <p className="meta">Edited {formatUpdated(doc.updatedAt)}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className="section">
          <h2>Shared with you</h2>
          {shared.length === 0 && !loading ? (
            <p className="empty">Nothing has been shared with you yet.</p>
          ) : null}
          <div className="cards">
            {shared.map((doc) => (
              <Link key={doc.id} href={`/docs/${doc.id}`} className="card">
                <h3>{doc.title}</h3>
                <p className="meta">
                  {doc.role === 'viewer' ? 'Can view' : 'Can edit'} · From {doc.ownerName} · Edited{' '}
                  {formatUpdated(doc.updatedAt)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
