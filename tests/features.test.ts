import { describe, expect, it } from 'vitest';
import {
  addComment,
  authenticate,
  createDocument,
  getDocumentForUser,
  heartbeat,
  listDocuments,
  listVersions,
  openDatabase,
  removeShare,
  resolveComment,
  restoreVersion,
  seedUsers,
  shareDocument,
  updateDocument,
  updateProfile,
} from '../lib/store';

describe('roles, history, comments, and presence', () => {
  it('lets a viewer read and comment, and blocks edits', () => {
    const db = openDatabase(':memory:');
    seedUsers(db);
    const created = createDocument(db, 'user_alex', { title: 'Brief' });
    if (!created.ok) throw new Error('expected document');

    const shared = shareDocument(db, 'user_alex', created.document.id, 'sam@ajaia.test', 'viewer');
    expect(shared.ok).toBe(true);
    if (shared.ok) expect(shared.document.collaborators[0]?.role).toBe('viewer');

    const opened = getDocumentForUser(db, 'user_sam', created.document.id);
    expect(opened.ok).toBe(true);
    if (opened.ok) expect(opened.document.role).toBe('viewer');
    expect(listDocuments(db, 'user_sam').shared[0]?.role).toBe('viewer');

    const edit = updateDocument(db, 'user_sam', created.document.id, { title: 'Changed' });
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.code).toBe('read-only');

    const commented = addComment(db, 'user_sam', created.document.id, {
      body: 'Please clarify the date.',
      quote: 'Brief',
    });
    expect(commented.ok).toBe(true);
    if (commented.ok) {
      expect(commented.comments[0]?.body).toMatch(/date/);
      const resolved = resolveComment(db, 'user_alex', created.document.id, commented.comments[0].id);
      expect(resolved.ok).toBe(true);
      if (resolved.ok) expect(resolved.comments[0]?.resolvedAt).toBeTruthy();
    }

    const removed = removeShare(db, 'user_alex', created.document.id, 'sam@ajaia.test');
    expect(removed.ok).toBe(true);
    const hidden = getDocumentForUser(db, 'user_sam', created.document.id);
    expect(hidden.ok).toBe(false);
  });

  it('keeps an older copy and can restore it', () => {
    const db = openDatabase(':memory:');
    seedUsers(db);
    const created = createDocument(db, 'user_alex', { title: 'First title' });
    if (!created.ok) throw new Error('expected document');

    const first = listVersions(db, 'user_alex', created.document.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const originalId = first.versions[0]?.id;
    expect(originalId).toBeTruthy();

    const edited = updateDocument(
      db,
      'user_alex',
      created.document.id,
      { title: 'Second title' },
      new Date('2026-02-01T00:00:00.000Z'),
    );
    expect(edited.ok).toBe(true);

    const history = listVersions(db, 'user_alex', created.document.id);
    expect(history.ok).toBe(true);
    if (!history.ok || !originalId) return;
    expect(history.versions.length).toBeGreaterThan(1);

    const restored = restoreVersion(db, 'user_alex', created.document.id, originalId);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.document.title).toBe('First title');

    const viewerShare = shareDocument(db, 'user_alex', created.document.id, 'sam@ajaia.test', 'viewer');
    expect(viewerShare.ok).toBe(true);
    const blocked = restoreVersion(db, 'user_sam', created.document.id, originalId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('read-only');
  });

  it('updates a profile when the current password matches', () => {
    const db = openDatabase(':memory:');
    seedUsers(db);
    const updated = updateProfile(db, 'user_alex', {
      name: 'Alex R.',
      email: 'alex.r@ajaia.test',
      currentPassword: 'demo1234',
      newPassword: 'newpass12',
    });
    expect(updated.ok).toBe(true);
    expect(authenticate(db, 'alex.r@ajaia.test', 'newpass12')?.name).toBe('Alex R.');
    const rejected = updateProfile(db, 'user_sam', {
      name: 'Sam',
      email: 'sam@ajaia.test',
      currentPassword: 'wrong',
    });
    expect(rejected.ok).toBe(false);
  });

  it('reports another person who is currently viewing', () => {
    const db = openDatabase(':memory:');
    seedUsers(db);
    const created = createDocument(db, 'user_alex', { title: 'Live' });
    if (!created.ok) throw new Error('expected document');
    shareDocument(db, 'user_alex', created.document.id, 'sam@ajaia.test', 'editor');

    const now = new Date('2026-03-01T12:00:00.000Z');
    const sam = heartbeat(db, 'user_sam', created.document.id, now);
    expect(sam.ok).toBe(true);

    const alex = heartbeat(db, 'user_alex', created.document.id, now);
    expect(alex.ok).toBe(true);
    if (alex.ok) expect(alex.viewers.map((person) => person.email)).toEqual(['sam@ajaia.test']);

    const later = heartbeat(db, 'user_alex', created.document.id, new Date(now.getTime() + 20_000));
    expect(later.ok).toBe(true);
    if (later.ok) expect(later.viewers).toHaveLength(0);
  });

  it('shares a caret and text, and ignores a stale or view-only write', () => {
    const db = openDatabase(':memory:');
    seedUsers(db);
    const created = createDocument(db, 'user_alex', { title: 'Live' });
    if (!created.ok) throw new Error('expected document');
    shareDocument(db, 'user_alex', created.document.id, 'sam@ajaia.test', 'editor');
    const live = {
      type: 'doc' as const,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello live' }] }],
    };
    const now = new Date('2026-03-01T12:00:00.000Z');
    const sam = heartbeat(db, 'user_sam', created.document.id, now, {
      from: 3,
      to: 5,
      title: 'Live',
      content: live,
      baseUpdatedAt: created.document.updatedAt,
    });
    expect(sam.ok).toBe(true);

    const alex = heartbeat(db, 'user_alex', created.document.id, now);
    expect(alex.ok).toBe(true);
    if (!alex.ok) return;
    expect(alex.viewers[0]).toMatchObject({ email: 'sam@ajaia.test', from: 3, to: 5 });
    expect(alex.content).toEqual(live);
    expect(alex.updatedBy).toBe('user_sam');

    const stale = heartbeat(db, 'user_alex', created.document.id, new Date(now.getTime() + 1000), {
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Too late' }] }] },
      baseUpdatedAt: created.document.updatedAt,
    });
    expect(stale.ok).toBe(true);
    if (stale.ok) expect(stale.content).toEqual(live);

    shareDocument(db, 'user_alex', created.document.id, 'sam@ajaia.test', 'viewer');
    const blocked = heartbeat(db, 'user_sam', created.document.id, new Date(now.getTime() + 2000), {
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nope' }] }] },
      baseUpdatedAt: alex.updatedAt,
    });
    expect(blocked.ok).toBe(true);
    if (blocked.ok) expect(blocked.content).toEqual(live);
  });
});
