import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEMO_ACCOUNTS } from './demo-accounts';
import { importFile } from './import-file';
import { markdownToDoc } from './markdown';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './passwords';
import type {
  AccessRole,
  CommentRecord,
  DocContent,
  PresencePerson,
  PublicDocument,
  PublicUser,
  ShareRole,
  StoreError,
  Summary,
  VersionDetail,
  VersionSummary,
} from './types';
import { normalizeContent, normalizeTitle } from './validate';

type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
};

type DocumentRow = {
  id: string;
  title: string;
  content_json: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  owner_name: string;
  owner_email: string;
};

const WELCOME_MARKDOWN = `# Welcome to Ajaia Docs

This sample belongs to **Alex Rivera** and is shared with **Sam Okonkwo**. Formatting stays with the document after a refresh.

## Try this

- Rename the document from the title field
- Format text with the toolbar
- Import a .txt, .md, or .docx file from the library
- Share a document you own with the other seeded account

1. Edit a line on this page
2. Refresh the browser
3. Sign in as the other person and open it again
`;

const documentSelect = `
  SELECT d.id, d.title, d.content_json, d.owner_id, d.created_at, d.updated_at,
         u.name AS owner_name, u.email AS owner_email
  FROM documents d
  JOIN users u ON u.id = d.owner_id
`;

const globalForDb = globalThis as unknown as { ajaiaDb?: DatabaseSync };

export function openDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  if (filename !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_shares (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'editor',
      created_at TEXT NOT NULL,
      PRIMARY KEY (document_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_id);
    CREATE INDEX IF NOT EXISTS shares_user_idx ON document_shares(user_id);

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      saved_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id),
      quote TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS presence (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL,
      cursor_from INTEGER,
      cursor_to INTEGER,
      PRIMARY KEY (document_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS versions_document_idx ON document_versions(document_id, created_at);
    CREATE INDEX IF NOT EXISTS comments_document_idx ON comments(document_id, created_at);
  `);

  const shareColumns = db.prepare('PRAGMA table_info(document_shares)').all() as Array<{ name: string }>;
  if (!shareColumns.some((column) => column.name === 'role')) {
    db.exec("ALTER TABLE document_shares ADD COLUMN role TEXT NOT NULL DEFAULT 'editor'");
  }
  ensureColumn(db, 'presence', 'cursor_from', 'INTEGER');
  ensureColumn(db, 'presence', 'cursor_to', 'INTEGER');
  ensureColumn(db, 'documents', 'updated_by', 'TEXT');
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function seedUsers(db: DatabaseSync) {
  const insert = db.prepare(
    'INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)',
  );
  for (const account of DEMO_ACCOUNTS) {
    insert.run(account.id, account.email, account.name, hashPassword(account.password));
  }
}

export function seedDemo(db: DatabaseSync) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number } | undefined;
  if (row && Number(row.n) > 0) return;

  seedUsers(db);
  const now = new Date().toISOString();
  const content = markdownToDoc(WELCOME_MARKDOWN);
  db.prepare(
    `INSERT INTO documents (id, title, content_json, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('doc_welcome', 'Welcome to Ajaia Docs', JSON.stringify(content), 'user_alex', now, now);
  db.prepare(
    'INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
  ).run('doc_welcome', 'user_sam', 'editor', now);
  recordVersion(db, 'doc_welcome', 'Welcome to Ajaia Docs', JSON.stringify(content), 'user_alex', new Date(now), true);
}

function ensureWelcomeVersion(db: DatabaseSync) {
  const welcome = db
    .prepare('SELECT title, content_json, owner_id FROM documents WHERE id = ?')
    .get('doc_welcome') as { title: string; content_json: string; owner_id: string } | undefined;
  if (!welcome) return;
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM document_versions WHERE document_id = ?')
    .get('doc_welcome') as { n: number };
  if (Number(count.n) > 0) return;
  recordVersion(db, 'doc_welcome', welcome.title, welcome.content_json, welcome.owner_id, new Date(), true);
}

export function getDb(): DatabaseSync {
  if (!globalForDb.ajaiaDb) {
    const filename = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'ajaia.db');
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    const db = openDatabase(filename);
    seedDemo(db);
    ensureWelcomeVersion(db);
    globalForDb.ajaiaDb = db;
  }
  return globalForDb.ajaiaDb;
}

export function findUserByEmail(db: DatabaseSync, email: string): UserRow | undefined {
  return db
    .prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?')
    .get(email.trim().toLowerCase()) as UserRow | undefined;
}

export function findUserById(db: DatabaseSync, id: string): PublicUser | null {
  const row = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(id) as
    | Omit<UserRow, 'password_hash'>
    | undefined;
  return row ?? null;
}

export function authenticate(db: DatabaseSync, email: string, password: string): PublicUser | null {
  const user = findUserByEmail(db, email);
  const valid = verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid) return null;
  return { id: user.id, email: user.email, name: user.name };
}

export function listUsers(db: DatabaseSync): PublicUser[] {
  return db.prepare('SELECT id, email, name FROM users ORDER BY name COLLATE NOCASE').all() as PublicUser[];
}

export function updateProfile(
  db: DatabaseSync,
  userId: string,
  input: { name?: unknown; email?: unknown; currentPassword?: unknown; newPassword?: unknown },
): { ok: true; user: PublicUser } | StoreError {
  const existing = db
    .prepare('SELECT id, email, name, password_hash FROM users WHERE id = ?')
    .get(userId) as UserRow | undefined;
  if (!existing) return { ok: false, status: 404, code: 'not-found', error: 'Account not found.' };
  if (typeof input.currentPassword !== 'string' || !verifyPassword(input.currentPassword, existing.password_hash)) {
    return { ok: false, status: 400, code: 'invalid', error: 'Current password does not match.' };
  }

  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) return { ok: false, status: 400, code: 'invalid', error: 'Enter your name.' };
  if (name.length > 80) {
    return { ok: false, status: 400, code: 'invalid', error: 'Name must be 80 characters or fewer.' };
  }
  if (typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    return { ok: false, status: 400, code: 'invalid', error: 'Enter a valid email address.' };
  }

  const email = input.email.trim().toLowerCase();
  const taken = findUserByEmail(db, email);
  if (taken && taken.id !== userId) {
    return { ok: false, status: 400, code: 'invalid', error: 'Another account already uses that email.' };
  }

  let passwordHash = existing.password_hash;
  if (typeof input.newPassword === 'string' && input.newPassword.length > 0) {
    if (input.newPassword.length < 8) {
      return { ok: false, status: 400, code: 'invalid', error: 'New password must be at least 8 characters.' };
    }
    passwordHash = hashPassword(input.newPassword);
  }

  db.prepare('UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?').run(
    name,
    email,
    passwordHash,
    userId,
  );
  return { ok: true, user: { id: userId, name, email } };
}

function shareRoleFor(db: DatabaseSync, documentId: string, userId: string): ShareRole | null {
  const row = db
    .prepare('SELECT role FROM document_shares WHERE document_id = ? AND user_id = ?')
    .get(documentId, userId) as { role: string } | undefined;
  if (!row) return null;
  return row.role === 'viewer' ? 'viewer' : 'editor';
}

function collaborators(db: DatabaseSync, documentId: string) {
  return db
    .prepare(
      `SELECT u.name AS name, u.email AS email, s.role AS role
       FROM document_shares s
       JOIN users u ON u.id = s.user_id
       WHERE s.document_id = ?
       ORDER BY u.name`,
    )
    .all(documentId) as Array<{ name: string; email: string; role: string }>;
}

function parseContent(serialized: string): DocContent {
  try {
    const parsed = JSON.parse(serialized) as DocContent;
    if (parsed?.type === 'doc' && Array.isArray(parsed.content)) return parsed;
  } catch {
    // Fall through to an empty document if a row is unreadable.
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function toPublic(db: DatabaseSync, row: DocumentRow, role: AccessRole): PublicDocument {
  return {
    id: row.id,
    title: row.title,
    content: parseContent(row.content_json),
    updatedAt: row.updated_at,
    role,
    owner: { name: row.owner_name, email: row.owner_email },
    collaborators: collaborators(db, row.id).map((person) => ({
      name: person.name,
      email: person.email,
      role: person.role === 'viewer' ? 'viewer' : 'editor',
    })),
  };
}

function toSummary(row: DocumentRow, role: AccessRole): Summary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    role,
    ownerName: row.owner_name,
  };
}

const READ_ONLY: StoreError = {
  ok: false,
  status: 403,
  code: 'read-only',
  error: 'You have view access. You can comment, not edit.',
};

function recordVersion(
  db: DatabaseSync,
  documentId: string,
  title: string,
  contentJson: string,
  userId: string,
  now: Date,
  force = false,
) {
  const latest = db
    .prepare(
      `SELECT id, saved_by, created_at
       FROM document_versions
       WHERE document_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(documentId) as { id: string; saved_by: string; created_at: string } | undefined;
  const stamp = now.toISOString();
  const recent =
    !force &&
    latest &&
    latest.saved_by === userId &&
    now.getTime() - new Date(latest.created_at).getTime() < 60_000 &&
    now.getTime() >= new Date(latest.created_at).getTime();

  if (recent && latest) {
    db.prepare('UPDATE document_versions SET title = ?, content_json = ?, created_at = ? WHERE id = ?').run(
      title,
      contentJson,
      stamp,
      latest.id,
    );
  } else {
    db.prepare(
      `INSERT INTO document_versions (id, document_id, title, content_json, saved_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), documentId, title, contentJson, userId, stamp);
  }

  db.prepare(
    `DELETE FROM document_versions
     WHERE document_id = ?
     AND id NOT IN (
       SELECT id FROM document_versions
       WHERE document_id = ?
       ORDER BY created_at DESC
       LIMIT 30
     )`,
  ).run(documentId, documentId);
}

export function listDocuments(db: DatabaseSync, userId: string): { owned: Summary[]; shared: Summary[] } {
  const owned = db
    .prepare(`${documentSelect} WHERE d.owner_id = ? ORDER BY d.updated_at DESC`)
    .all(userId) as DocumentRow[];
  const shared = db
    .prepare(
      `SELECT d.id, d.title, d.content_json, d.owner_id, d.created_at, d.updated_at,
              u.name AS owner_name, u.email AS owner_email, s.role AS share_role
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       JOIN document_shares s ON s.document_id = d.id
       WHERE s.user_id = ? AND d.owner_id != ?
       ORDER BY d.updated_at DESC`,
    )
    .all(userId, userId) as Array<DocumentRow & { share_role: string }>;

  return {
    owned: owned.map((row) => toSummary(row, 'owner')),
    shared: shared.map((row) => toSummary(row, row.share_role === 'viewer' ? 'viewer' : 'editor')),
  };
}

export function getDocumentForUser(
  db: DatabaseSync,
  userId: string,
  documentId: string,
): { ok: true; document: PublicDocument } | StoreError {
  const row = db.prepare(`${documentSelect} WHERE d.id = ?`).get(documentId) as DocumentRow | undefined;
  if (!row) return { ok: false, status: 404, code: 'not-found', error: 'Document not found.' };
  if (row.owner_id === userId) return { ok: true, document: toPublic(db, row, 'owner') };
  const shareRole = shareRoleFor(db, row.id, userId);
  if (shareRole) return { ok: true, document: toPublic(db, row, shareRole) };
  return { ok: false, status: 403, code: 'forbidden', error: 'Document not found.' };
}

export function createDocument(
  db: DatabaseSync,
  userId: string,
  input?: { title?: string; content?: DocContent },
): { ok: true; document: PublicDocument } | StoreError {
  const title = normalizeTitle(input?.title ?? 'Untitled');
  if (!title.ok) return title;
  const content = normalizeContent(input?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] });
  if (!content.ok) return content;

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO documents (id, title, content_json, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, title.title, JSON.stringify(content.content), userId, now, now);
  recordVersion(db, id, title.title, JSON.stringify(content.content), userId, new Date(now), true);

  return getDocumentForUser(db, userId, id);
}

export function updateDocument(
  db: DatabaseSync,
  userId: string,
  documentId: string,
  patch: { title?: unknown; content?: unknown },
  now = new Date(),
): { ok: true; document: PublicDocument } | StoreError {
  const existing = getDocumentForUser(db, userId, documentId);
  if (!existing.ok) return existing;
  if (existing.document.role === 'viewer') return READ_ONLY;

  let nextTitle = existing.document.title;
  if (patch.title !== undefined) {
    const title = normalizeTitle(patch.title);
    if (!title.ok) return title;
    nextTitle = title.title;
  }

  let nextContent = existing.document.content;
  if (patch.content !== undefined) {
    const content = normalizeContent(patch.content);
    if (!content.ok) return content;
    nextContent = content.content;
  }

  const contentJson = JSON.stringify(nextContent);
  const changed = nextTitle !== existing.document.title || contentJson !== JSON.stringify(existing.document.content);
  db.prepare(
    'UPDATE documents SET title = ?, content_json = ?, updated_at = ?, updated_by = ? WHERE id = ?',
  ).run(nextTitle, contentJson, now.toISOString(), userId, documentId);
  if (changed) recordVersion(db, documentId, nextTitle, contentJson, userId, now);

  return getDocumentForUser(db, userId, documentId);
}

function parseShareRole(role: unknown): ShareRole | StoreError {
  if (role === undefined || role === 'editor') return 'editor';
  if (role === 'viewer') return 'viewer';
  return { ok: false, status: 400, code: 'invalid', error: 'Role must be editor or viewer.' };
}

export function shareDocument(
  db: DatabaseSync,
  actorId: string,
  documentId: string,
  email: unknown,
  role?: unknown,
): { ok: true; document: PublicDocument } | StoreError {
  const existing = getDocumentForUser(db, actorId, documentId);
  if (!existing.ok) return existing;
  if (existing.document.role !== 'owner') {
    return { ok: false, status: 403, code: 'owner-only', error: 'Only the owner can share this document.' };
  }
  if (typeof email !== 'string' || !email.trim()) {
    return { ok: false, status: 400, code: 'invalid', error: 'Enter an email address.' };
  }
  const shareRole = parseShareRole(role);
  if (typeof shareRole !== 'string') return shareRole;

  const target = findUserByEmail(db, email);
  if (!target) {
    return {
      ok: false,
      status: 400,
      code: 'invalid',
      error: 'No account uses that email. This demo only includes the seeded users.',
    };
  }
  if (target.id === actorId) {
    return { ok: false, status: 400, code: 'invalid', error: 'You already own this document.' };
  }

  db.prepare(
    `INSERT INTO document_shares (document_id, user_id, role, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run(documentId, target.id, shareRole, new Date().toISOString());

  return getDocumentForUser(db, actorId, documentId);
}

export function removeShare(
  db: DatabaseSync,
  actorId: string,
  documentId: string,
  email: unknown,
): { ok: true; document: PublicDocument } | StoreError {
  const existing = getDocumentForUser(db, actorId, documentId);
  if (!existing.ok) return existing;
  if (existing.document.role !== 'owner') {
    return { ok: false, status: 403, code: 'owner-only', error: 'Only the owner can change access.' };
  }
  if (typeof email !== 'string' || !email.trim()) {
    return { ok: false, status: 400, code: 'invalid', error: 'Enter an email address.' };
  }
  const target = findUserByEmail(db, email);
  if (!target || !shareRoleFor(db, documentId, target.id)) {
    return { ok: false, status: 400, code: 'invalid', error: 'That person does not have access.' };
  }
  db.prepare('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?').run(documentId, target.id);
  return getDocumentForUser(db, actorId, documentId);
}

export function createDocumentFromFile(
  db: DatabaseSync,
  userId: string,
  filename: string,
  text: string,
  size?: number,
): { ok: true; document: PublicDocument } | StoreError {
  const imported = importFile(filename, text, size);
  if (!imported.ok) return imported;
  return createDocument(db, userId, { title: imported.title, content: imported.content });
}

export function listVersions(db: DatabaseSync, userId: string, documentId: string): { ok: true; versions: VersionSummary[] } | StoreError {
  const existing = getDocumentForUser(db, userId, documentId);
  if (!existing.ok) return existing;
  const versions = db
    .prepare(
      `SELECT v.id, v.title, v.created_at, u.name AS author_name
       FROM document_versions v
       JOIN users u ON u.id = v.saved_by
       WHERE v.document_id = ?
       ORDER BY v.created_at DESC`,
    )
    .all(documentId) as Array<{ id: string; title: string; created_at: string; author_name: string }>;
  return {
    ok: true,
    versions: versions.map((version) => ({
      id: version.id,
      title: version.title,
      createdAt: version.created_at,
      authorName: version.author_name,
    })),
  };
}

export function getVersion(
  db: DatabaseSync,
  userId: string,
  documentId: string,
  versionId: string,
): { ok: true; version: VersionDetail } | StoreError {
  const existing = getDocumentForUser(db, userId, documentId);
  if (!existing.ok) return existing;
  const row = db
    .prepare(
      `SELECT v.id, v.title, v.content_json, v.created_at, u.name AS author_name
       FROM document_versions v
       JOIN users u ON u.id = v.saved_by
       WHERE v.id = ? AND v.document_id = ?`,
    )
    .get(versionId, documentId) as
    | { id: string; title: string; content_json: string; created_at: string; author_name: string }
    | undefined;
  if (!row) return { ok: false, status: 404, code: 'not-found', error: 'That version was not found.' };
  return {
    ok: true,
    version: {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      authorName: row.author_name,
      content: parseContent(row.content_json),
    },
  };
}

export function restoreVersion(
  db: DatabaseSync,
  userId: string,
  documentId: string,
  versionId: string,
  now = new Date(),
): { ok: true; document: PublicDocument } | StoreError {
  const existing = getDocumentForUser(db, userId, documentId);
  if (!existing.ok) return existing;
  if (existing.document.role === 'viewer') return READ_ONLY;
  const version = getVersion(db, userId, documentId, versionId);
  if (!version.ok) return version;

  const contentJson = JSON.stringify(version.version.content);
  db.prepare(
    'UPDATE documents SET title = ?, content_json = ?, updated_at = ?, updated_by = ? WHERE id = ?',
  ).run(version.version.title, contentJson, now.toISOString(), userId, documentId);
  recordVersion(db, documentId, version.version.title, contentJson, userId, now, true);
  return getDocumentForUser(db, userId, documentId);
}

function listCommentRows(db: DatabaseSync, documentId: string): CommentRecord[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.quote, c.body, c.created_at, c.resolved_at, u.name AS author_name, u.email AS author_email
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.document_id = ?
       ORDER BY c.created_at DESC`,
    )
    .all(documentId) as Array<{
    id: string;
    quote: string;
    body: string;
    created_at: string;
    resolved_at: string | null;
    author_name: string;
    author_email: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    quote: row.quote,
    body: row.body,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    authorName: row.author_name,
    authorEmail: row.author_email,
  }));
}

export function listComments(
  db: DatabaseSync,
  userId: string,
  documentId: string,
): { ok: true; comments: CommentRecord[] } | StoreError {
  const existing = getDocumentForUser(db, userId, documentId);
  if (!existing.ok) return existing;
  return { ok: true, comments: listCommentRows(db, documentId) };
}

export function addComment(
  db: DatabaseSync,
  userId: string,
  documentId: string,
  input: { body?: unknown; quote?: unknown },
): { ok: true; comments: CommentRecord[] } | StoreError {
  const existing = getDocumentForUser(db, userId, documentId);
  if (!existing.ok) return existing;
  if (typeof input.body !== 'string' || !input.body.trim()) {
    return { ok: false, status: 400, code: 'invalid', error: 'Write a comment before saving it.' };
  }
  const body = input.body.trim();
  if (body.length > 2000) {
    return { ok: false, status: 400, code: 'invalid', error: 'Comments must be 2000 characters or fewer.' };
  }
  const quote = typeof input.quote === 'string' ? input.quote.trim().slice(0, 280) : '';
  db.prepare(
    `INSERT INTO comments (id, document_id, author_id, quote, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), documentId, userId, quote, body, new Date().toISOString());
  return { ok: true, comments: listCommentRows(db, documentId) };
}

export function resolveComment(
  db: DatabaseSync,
  userId: string,
  documentId: string,
  commentId: string,
): { ok: true; comments: CommentRecord[] } | StoreError {
  const existing = getDocumentForUser(db, userId, documentId);
  if (!existing.ok) return existing;
  const current = db
    .prepare('SELECT resolved_at FROM comments WHERE id = ? AND document_id = ?')
    .get(commentId, documentId) as { resolved_at: string | null } | undefined;
  if (!current) return { ok: false, status: 404, code: 'not-found', error: 'That comment was not found.' };
  db.prepare('UPDATE comments SET resolved_at = ? WHERE id = ?').run(
    current.resolved_at ? null : new Date().toISOString(),
    commentId,
  );
  return { ok: true, comments: listCommentRows(db, documentId) };
}

export function heartbeat(
  db: DatabaseSync,
  userId: string,
  documentId: string,
  now = new Date(),
  input?: { from?: unknown; to?: unknown; content?: unknown; title?: unknown; baseUpdatedAt?: unknown },
):
  | {
      ok: true;
      viewers: PresencePerson[];
      updatedAt: string;
      updatedBy: string | null;
      title: string;
      content: DocContent;
    }
  | StoreError {
  const existing = getDocumentForUser(db, userId, documentId);
  if (!existing.ok) return existing;

  const baseIsCurrent =
    typeof input?.baseUpdatedAt !== 'string' || input.baseUpdatedAt === existing.document.updatedAt;
  if (input?.content !== undefined && existing.document.role !== 'viewer' && baseIsCurrent) {
    const content = normalizeContent(input.content);
    if (content.ok) {
      let nextTitle = existing.document.title;
      if (input.title !== undefined) {
        const title = normalizeTitle(typeof input.title === 'string' && input.title.trim() ? input.title : nextTitle);
        if (title.ok) nextTitle = title.title;
      }
      const contentJson = JSON.stringify(content.content);
      const changed =
        nextTitle !== existing.document.title || contentJson !== JSON.stringify(existing.document.content);
      if (changed) {
        db.prepare(
          'UPDATE documents SET title = ?, content_json = ?, updated_at = ?, updated_by = ? WHERE id = ?',
        ).run(nextTitle, contentJson, now.toISOString(), userId, documentId);
        recordVersion(db, documentId, nextTitle, contentJson, userId, now);
      }
    }
  }

  const cursorFrom = typeof input?.from === 'number' && Number.isFinite(input.from) ? Math.max(0, Math.floor(input.from)) : null;
  const cursorTo = typeof input?.to === 'number' && Number.isFinite(input.to) ? Math.max(0, Math.floor(input.to)) : null;
  const stamp = now.toISOString();
  db.prepare(
    `INSERT INTO presence (document_id, user_id, updated_at, cursor_from, cursor_to)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(document_id, user_id) DO UPDATE SET
       updated_at = excluded.updated_at,
       cursor_from = excluded.cursor_from,
       cursor_to = excluded.cursor_to`,
  ).run(documentId, userId, stamp, cursorFrom, cursorTo);

  const cutoff = new Date(now.getTime() - 12_000).toISOString();
  const viewers = db
    .prepare(
      `SELECT u.name AS name, u.email AS email, p.cursor_from AS "from", p.cursor_to AS "to"
       FROM presence p
       JOIN users u ON u.id = p.user_id
       WHERE p.document_id = ? AND p.user_id != ? AND p.updated_at >= ?
       ORDER BY u.name`,
    )
    .all(documentId, userId, cutoff) as PresencePerson[];
  const fresh = db
    .prepare('SELECT title, content_json, updated_at, updated_by FROM documents WHERE id = ?')
    .get(documentId) as { title: string; content_json: string; updated_at: string; updated_by: string | null };
  return {
    ok: true,
    viewers,
    updatedAt: fresh.updated_at,
    updatedBy: fresh.updated_by,
    title: fresh.title,
    content: parseContent(fresh.content_json),
  };
}
