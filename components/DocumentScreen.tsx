'use client';

import { AccountButton } from '@/components/AccountButton';
import { downloadDocxFile, downloadMarkdownFile, downloadPdfFile, downloadTextFile } from '@/components/download-file';
import { Editor, type EditorHandle } from '@/components/Editor';
import { formatUpdated } from '@/lib/format';
import { docToMarkdown } from '@/lib/markdown';
import type {
  CommentRecord,
  DocContent,
  PresencePerson,
  PublicDocument,
  PublicUser,
  ShareRole,
  VersionDetail,
  VersionSummary,
} from '@/lib/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';

function payloadFor(title: string, content: DocContent) {
  const payload: { content: DocContent; title?: string } = { content };
  const trimmed = title.trim();
  if (trimmed) payload.title = trimmed;
  return payload;
}

type Panel = 'share' | 'history' | 'comments' | null;

function caretColor(email: string) {
  const palette = ['#c45c26', '#1d4e89', '#6b3fa0', '#9a3d5a'];
  let hash = 0;
  for (const char of email) hash = (hash + char.charCodeAt(0)) % palette.length;
  return palette[hash];
}

export function DocumentScreen({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [doc, setDoc] = useState<PublicDocument | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<DocContent | null>(null);
  const [status, setStatus] = useState('Saved');
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [shareRole, setShareRole] = useState<ShareRole>('editor');
  const [directory, setDirectory] = useState<PublicUser[]>([]);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [viewers, setViewers] = useState<PresencePerson[]>([]);
  const [remoteUpdate, setRemoteUpdate] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [quote, setQuote] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [preview, setPreview] = useState<VersionDetail | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  const roleRef = useRef(doc?.role);
  const userIdRef = useRef<string | null>(null);
  const editorRef = useRef<EditorHandle>(null);
  const selectionRef = useRef({ from: 1, to: 1 });
  const pendingRemote = useRef<{ title: string; content: DocContent; updatedAt: string } | null>(null);
  const lastSaved = useRef('');
  const knownUpdated = useRef('');
  const saveSeq = useRef(0);
  const loaded = useRef(false);
  titleRef.current = title;
  contentRef.current = content;
  roleRef.current = doc?.role;
  userIdRef.current = user?.id ?? null;

  function applyLive(nextTitle: string, nextContent: DocContent, updatedAt: string) {
    if (!editorRef.current) return false;
    knownUpdated.current = updatedAt;
    lastSaved.current = JSON.stringify(payloadFor(nextTitle, nextContent));
    pendingRemote.current = null;
    setTitle(nextTitle);
    setContent(nextContent);
    setDoc((current) => (current ? { ...current, title: nextTitle, content: nextContent, updatedAt } : current));
    setRemoteUpdate(false);
    setStatus(roleRef.current === 'viewer' ? 'View only' : 'Saved');
    editorRef.current.applyRemote(nextContent);
    return true;
  }

  function applyRemote(next: PublicDocument) {
    knownUpdated.current = next.updatedAt;
    lastSaved.current = JSON.stringify(payloadFor(next.title, next.content));
    setDoc(next);
    setTitle(next.title);
    setContent(next.content);
    setEpoch((value) => value + 1);
    setRemoteUpdate(false);
    setStatus(next.role === 'viewer' ? 'View only' : 'Saved');
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [meResponse, docResponse] = await Promise.all([
        fetch('/api/auth/me'),
        fetch(`/api/documents/${documentId}`),
      ]);
      if (meResponse.status === 401 || docResponse.status === 401) {
        router.push('/login');
        return;
      }
      const docBody = (await docResponse.json().catch(() => null)) as {
        document?: PublicDocument;
        error?: string;
      } | null;
      const meBody = (await meResponse.json().catch(() => null)) as { user?: PublicUser } | null;
      if (cancelled) return;
      if (!docResponse.ok || !docBody?.document) {
        setLoadError(docBody?.error ?? 'Document not found.');
        return;
      }
      setUser(meBody?.user ?? null);
      setDoc(docBody.document);
      setTitle(docBody.document.title);
      setContent(docBody.document.content);
      knownUpdated.current = docBody.document.updatedAt;
      lastSaved.current = JSON.stringify(payloadFor(docBody.document.title, docBody.document.content));
      setStatus(docBody.document.role === 'viewer' ? 'View only' : 'Saved');
      loaded.current = true;
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [documentId, router]);

  async function persist() {
    if (!loaded.current || !contentRef.current || roleRef.current === 'viewer' || pendingRemote.current) return;
    const payload = payloadFor(titleRef.current, contentRef.current);
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSaved.current) {
      setStatus('Saved');
      return;
    }
    const seq = ++saveSeq.current;
    setStatus('Saving…');
    setError(null);
    const response = await fetch(`/api/documents/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: snapshot,
    });
    if (seq !== saveSeq.current) return;
    if (response.status === 401) {
      router.push('/login');
      return;
    }
    const body = (await response.json().catch(() => null)) as { document?: PublicDocument; error?: string } | null;
    if (!response.ok || !body?.document) {
      setStatus('Not saved');
      setError(body?.error ?? 'Could not save this document.');
      return;
    }
    if (pendingRemote.current) return;
    const saved = body.document;
    lastSaved.current = snapshot;
    knownUpdated.current = saved.updatedAt;
    setDoc((current) =>
      current
        ? {
            ...saved,
            collaborators: current.collaborators,
            role: current.role,
            owner: current.owner,
          }
        : saved,
    );
    setRemoteUpdate(false);
    setStatus('Saved');
  }

  useEffect(() => {
    if (!loaded.current || !content || roleRef.current === 'viewer') return;
    const snapshot = JSON.stringify(payloadFor(title, content));
    if (snapshot === lastSaved.current) return;
    setStatus('Unsaved changes');
    const handle = window.setTimeout(() => {
      void persist();
    }, 700);
    return () => window.clearTimeout(handle);
  }, [title, content, documentId, doc?.role]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    async function beat() {
      const currentContent = contentRef.current;
      const localSnapshot = currentContent ? JSON.stringify(payloadFor(titleRef.current, currentContent)) : '';
      const dirty = Boolean(currentContent) && localSnapshot !== lastSaved.current && roleRef.current !== 'viewer';
      const response = await fetch(`/api/documents/${documentId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: selectionRef.current.from,
          to: selectionRef.current.to,
          ...(dirty && !pendingRemote.current
            ? { content: currentContent, title: titleRef.current, baseUpdatedAt: knownUpdated.current }
            : {}),
        }),
      });
      if (response.status === 401) {
        router.push('/login');
        return;
      }
      const body = (await response.json().catch(() => null)) as {
        viewers?: PresencePerson[];
        updatedAt?: string;
        updatedBy?: string | null;
        title?: string;
        content?: DocContent;
      } | null;
      if (cancelled || !response.ok || !body) return;
      setViewers(body.viewers ?? []);
      editorRef.current?.setCarets(
        (body.viewers ?? [])
          .filter((person) => person.from !== null)
          .map((person) => ({
            name: person.name,
            from: person.from ?? 0,
            to: person.to ?? person.from ?? 0,
            color: caretColor(person.email),
          })),
      );
      if (!body.updatedAt || !body.content || body.updatedAt === knownUpdated.current) return;
      const fromSomeoneElse = Boolean(body.updatedBy) && body.updatedBy !== userIdRef.current;
      const latest = contentRef.current ? JSON.stringify(payloadFor(titleRef.current, contentRef.current)) : '';
      const stillClean = roleRef.current === 'viewer' || latest === lastSaved.current;
      if (!fromSomeoneElse) {
        knownUpdated.current = body.updatedAt;
        if (contentRef.current && JSON.stringify(body.content) === JSON.stringify(contentRef.current)) {
          lastSaved.current = JSON.stringify(payloadFor(body.title ?? titleRef.current, body.content));
          pendingRemote.current = null;
          setRemoteUpdate(false);
          if (roleRef.current !== 'viewer') setStatus('Saved');
        }
        return;
      }
      if (stillClean) {
        applyLive(body.title ?? titleRef.current, body.content, body.updatedAt);
        return;
      }
      pendingRemote.current = { title: body.title ?? titleRef.current, content: body.content, updatedAt: body.updatedAt };
      setRemoteUpdate(true);
    }
    void beat();
    const timer = window.setInterval(() => void beat(), 800);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [documentId, doc?.id, router]);

  useEffect(() => {
    if (panel !== 'share') return;
    let cancelled = false;
    async function loadPeople() {
      const response = await fetch('/api/users');
      const body = (await response.json().catch(() => null)) as { users?: PublicUser[] } | null;
      if (!cancelled && response.ok && body?.users) setDirectory(body.users);
    }
    void loadPeople();
    return () => {
      cancelled = true;
    };
  }, [panel]);

  async function logout() {
    await persist();
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  function togglePanel(next: Panel) {
    setPanel((current) => (current === next ? null : next));
  }

  async function changeAccess(email: string, role: ShareRole | 'remove') {
    if (sharing) return;
    setSharing(true);
    setShareError(null);
    const response = await fetch(`/api/documents/${documentId}/share`, {
      method: role === 'remove' ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(role === 'remove' ? { email } : { email, role }),
    });
    const body = (await response.json().catch(() => null)) as { document?: PublicDocument; error?: string } | null;
    if (!response.ok || !body?.document) {
      const fresh = await fetch(`/api/documents/${documentId}`);
      const freshBody = (await fresh.json().catch(() => null)) as { document?: PublicDocument } | null;
      setSharing(false);
      if (fresh.ok && freshBody?.document) {
        setDoc(freshBody.document);
        if (role === 'remove' && !freshBody.document.collaborators.some((person) => person.email === email)) return;
      }
      setShareError(body?.error ?? 'Could not update access.');
      return;
    }
    setSharing(false);
    setDoc(body.document);
  }

  async function saveAs(kind: 'md' | 'txt' | 'pdf' | 'docx') {
    if (!contentRef.current) return;
    setSaveOpen(false);
    const currentTitle = titleRef.current || 'Untitled';
    if (kind === 'md') downloadMarkdownFile(currentTitle, contentRef.current);
    if (kind === 'txt') downloadTextFile(currentTitle, contentRef.current);
    if (kind === 'pdf') await downloadPdfFile(currentTitle, contentRef.current);
    if (kind === 'docx') await downloadDocxFile(currentTitle, contentRef.current);
  }

  async function loadVersions() {
    setHistoryError(null);
    const response = await fetch(`/api/documents/${documentId}/versions`);
    const body = (await response.json().catch(() => null)) as { versions?: VersionSummary[]; error?: string } | null;
    if (!response.ok || !body?.versions) {
      setHistoryError(body?.error ?? 'Could not load history.');
      return;
    }
    setVersions(body.versions);
  }

  async function openVersion(versionId: string) {
    const response = await fetch(`/api/documents/${documentId}/versions/${versionId}`);
    const body = (await response.json().catch(() => null)) as { version?: VersionDetail; error?: string } | null;
    if (!response.ok || !body?.version) {
      setHistoryError(body?.error ?? 'Could not open that version.');
      return;
    }
    setPreview(body.version);
  }

  async function restore(versionId: string) {
    const response = await fetch(`/api/documents/${documentId}/versions/${versionId}/restore`, { method: 'POST' });
    const body = (await response.json().catch(() => null)) as { document?: PublicDocument; error?: string } | null;
    if (!response.ok || !body?.document) {
      setHistoryError(body?.error ?? 'Could not restore that version.');
      return;
    }
    applyRemote(body.document);
    await loadVersions();
  }

  async function loadComments() {
    const response = await fetch(`/api/documents/${documentId}/comments`);
    const body = (await response.json().catch(() => null)) as { comments?: CommentRecord[]; error?: string } | null;
    if (!response.ok || !body?.comments) {
      setCommentError(body?.error ?? 'Could not load comments.');
      return;
    }
    setComments(body.comments);
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    setCommentError(null);
    const response = await fetch(`/api/documents/${documentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: commentBody, quote }),
    });
    const body = (await response.json().catch(() => null)) as { comments?: CommentRecord[]; error?: string } | null;
    if (!response.ok || !body?.comments) {
      setCommentError(body?.error ?? 'Could not save that comment.');
      return;
    }
    setComments(body.comments);
    setCommentBody('');
  }

  async function toggleResolved(commentId: string) {
    const response = await fetch(`/api/documents/${documentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentId }),
    });
    const body = (await response.json().catch(() => null)) as { comments?: CommentRecord[] } | null;
    if (response.ok && body?.comments) setComments(body.comments);
  }

  const canEdit = doc?.role !== 'viewer';

  return (
    <div className="app">
      <header className="topbar no-print">
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
      <main className="page doc-page">
        {loadError ? (
          <div className="login-card narrow">
            <h1>Document unavailable</h1>
            <p className="lede">{loadError}</p>
            <Link href="/docs" className="primary link-button">
              Back to documents
            </Link>
          </div>
        ) : null}
        {doc && content ? (
          <>
            <div className="doc-top">
              <input
                className="title-input"
                aria-label="Document title"
                value={title}
                maxLength={120}
                readOnly={!canEdit}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={() => {
                  if (canEdit && !title.trim()) setTitle('Untitled');
                }}
              />
              <div className="doc-actions no-print">
                <span className={status === 'Not saved' ? 'save-state is-error' : 'save-state'}>{status}</span>
                <div className="share-wrap">
                  <button type="button" className="text-button" onClick={() => setSaveOpen((open) => !open)}>
                    Save as
                  </button>
                  {saveOpen ? (
                    <div className="share-panel save-menu">
                      <button type="button" className="menu-item" onClick={() => void saveAs('md')}>
                        Markdown (.md)
                      </button>
                      <button type="button" className="menu-item" onClick={() => void saveAs('txt')}>
                        Plain text (.txt)
                      </button>
                      <button type="button" className="menu-item" onClick={() => void saveAs('pdf')}>
                        PDF (.pdf)
                      </button>
                      <button type="button" className="menu-item" onClick={() => void saveAs('docx')}>
                        Word (.docx)
                      </button>
                    </div>
                  ) : null}
                </div>
                <button type="button" className="text-button" onClick={() => { togglePanel('history'); void loadVersions(); }}>
                  History
                </button>
                <button type="button" className="text-button" onClick={() => { togglePanel('comments'); void loadComments(); }}>
                  Comments
                </button>
                <button type="button" className="primary" onClick={() => togglePanel('share')}>
                  Share
                </button>
              </div>
            </div>
            {viewers.length > 0 ? (
              <p className="presence no-print">
                {viewers.map((person) => person.name).join(', ')} {viewers.length === 1 ? 'is' : 'are'} viewing
              </p>
            ) : null}
            {doc.role === 'editor' ? (
              <p className="banner no-print">Shared with you by {doc.owner.name}. You can edit this document.</p>
            ) : null}
            {doc.role === 'viewer' ? (
              <p className="banner no-print">Shared with you by {doc.owner.name}. You can view and comment, not edit.</p>
            ) : null}
            {remoteUpdate ? (
              <p className="banner no-print">
                The other person has newer text. Your unsaved typing stays until you take their version.
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    const pending = pendingRemote.current;
                    if (!pending) return;
                    applyLive(pending.title, pending.content, pending.updatedAt);
                  }}
                >
                  Use their version
                </button>
              </p>
            ) : null}
            {error ? (
              <p className="error no-print" role="alert">
                {error}
              </p>
            ) : null}
            {panel ? (
              <section className="dock no-print" aria-label={panel === 'share' ? 'Share' : panel === 'history' ? 'History' : 'Comments'}>
                <div className="dock-head">
                  <h2>{panel === 'share' ? 'Share' : panel === 'history' ? 'History' : 'Comments'}</h2>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setPanel(null);
                      setPreview(null);
                    }}
                  >
                    Close
                  </button>
                </div>
                {panel === 'share' ? (
                  <>
                    {doc.role === 'owner' ? (
                      <>
                        <h3 className="dock-label">People you can add</h3>
                        {directory.filter(
                          (person) =>
                            person.email !== doc.owner.email &&
                            !doc.collaborators.some((collaborator) => collaborator.email === person.email),
                        ).length === 0 ? (
                          <p className="hint">Everyone already has access.</p>
                        ) : (
                          <ul className="people">
                            {directory
                              .filter(
                                (person) =>
                                  person.email !== doc.owner.email &&
                                  !doc.collaborators.some((collaborator) => collaborator.email === person.email),
                              )
                              .map((person) => (
                                <li key={person.email} className="person-card">
                                  <strong>{person.name}</strong>
                                  <span>{person.email}</span>
                                  <span className="row-actions">
                                    <select
                                      aria-label={`Access for ${person.name}`}
                                      value={shareRole}
                                      onChange={(event) => setShareRole(event.target.value as ShareRole)}
                                    >
                                      <option value="editor">Can edit</option>
                                      <option value="viewer">Can view</option>
                                    </select>
                                    <button
                                      type="button"
                                      className="primary"
                                      disabled={sharing}
                                      onClick={() => void changeAccess(person.email, shareRole)}
                                    >
                                      Add
                                    </button>
                                  </span>
                                </li>
                              ))}
                          </ul>
                        )}
                        {shareError ? (
                          <p className="error" role="alert">
                            {shareError}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="lede">Only the owner can change who has access.</p>
                    )}
                    <h3 className="dock-label">Has access</h3>
                    <ul className="people">
                      <li className="person-card">
                        <strong>{doc.owner.name}</strong>
                        <span>Owner · {doc.owner.email}</span>
                      </li>
                      {doc.collaborators.length === 0 ? <li className="hint">No one else has access yet.</li> : null}
                      {doc.collaborators.map((person) => (
                        <li key={person.email} className="person-card">
                          <strong>{person.name}</strong>
                          <span>{person.email}</span>
                          {doc.role === 'owner' ? (
                            <span className="row-actions">
                              <select
                                aria-label={`Access for ${person.name}`}
                                value={person.role}
                                onChange={(event) => void changeAccess(person.email, event.target.value as ShareRole)}
                              >
                                <option value="editor">Can edit</option>
                                <option value="viewer">Can view</option>
                              </select>
                              <button
                                type="button"
                                className="danger"
                                disabled={sharing}
                                onClick={() => void changeAccess(person.email, 'remove')}
                              >
                                Remove access
                              </button>
                            </span>
                          ) : (
                            <span>{person.role === 'viewer' ? 'Can view' : 'Can edit'}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {panel === 'history' ? (
                  <>
                    <p className="hint">Saves from the same person fold together for about a minute. Restoring keeps the current copy in this list.</p>
                    {historyError ? (
                      <p className="error" role="alert">
                        {historyError}
                      </p>
                    ) : null}
                    <ul className="version-list">
                      {versions.map((version) => (
                        <li key={version.id}>
                          <button
                            type="button"
                            className={preview?.id === version.id ? 'version is-open' : 'version'}
                            aria-expanded={preview?.id === version.id}
                            onClick={() => {
                              if (preview?.id === version.id) setPreview(null);
                              else void openVersion(version.id);
                            }}
                          >
                            <strong>{version.title}</strong>
                            <span>
                              {version.authorName} · {formatUpdated(version.createdAt)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {preview ? (
                      <div className="preview-block">
                        <div className="preview-head">
                          <strong>Preview</strong>
                          <button type="button" className="text-button" onClick={() => setPreview(null)}>
                            Collapse
                          </button>
                        </div>
                        <pre>{docToMarkdown(preview.content)}</pre>
                        {canEdit ? (
                          <button type="button" className="primary" onClick={() => void restore(preview.id)}>
                            Restore this version
                          </button>
                        ) : (
                          <p className="hint">View access cannot restore a version.</p>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {panel === 'comments' ? (
                  <>
                    <form onSubmit={(event) => void submitComment(event)}>
                      {quote ? <p className="quote">“{quote}”</p> : <p className="hint">Select text in the document to attach a quote.</p>}
                      <label className="field">
                        Comment
                        <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} required maxLength={2000} />
                      </label>
                      {commentError ? (
                        <p className="error" role="alert">
                          {commentError}
                        </p>
                      ) : null}
                      <button className="primary" type="submit">
                        Add comment
                      </button>
                    </form>
                    <ul className="comment-list">
                      {comments.map((comment) => (
                        <li
                          key={comment.id}
                          className={[comment.resolvedAt ? 'is-resolved' : '', comment.quote ? 'has-quote' : ''].filter(Boolean).join(' ') || undefined}
                          onClick={() => {
                            if (!comment.quote) return;
                            const found = editorRef.current?.revealQuote(comment.quote);
                            setCommentError(found ? null : 'That quoted text is no longer in the document.');
                          }}
                        >
                          <div className="comment-meta">
                            <strong>{comment.authorName}</strong>
                            <span>{formatUpdated(comment.createdAt)}</span>
                          </div>
                          {comment.quote ? <p className="quote">“{comment.quote}”</p> : null}
                          <p>{comment.body}</p>
                          <button
                            type="button"
                            className="text-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void toggleResolved(comment.id);
                            }}
                          >
                            {comment.resolvedAt ? 'Reopen' : 'Resolve'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            ) : null}
            <Editor
              ref={editorRef}
              key={`${documentId}-${epoch}`}
              documentId={documentId}
              initial={content}
              editable={canEdit}
              onSelection={(from, to) => {
                selectionRef.current = { from, to };
              }}
              onQuoteChange={setQuote}
              onChange={(next) => {
                setContent((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
              }}
            />
          </>
        ) : null}
        {!doc && !loadError ? <p className="lede">Loading document…</p> : null}
      </main>
    </div>
  );
}
