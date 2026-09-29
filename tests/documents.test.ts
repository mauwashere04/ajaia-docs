import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { markdownToDoc } from '../lib/markdown';
import {
  authenticate,
  createDocument,
  createDocumentFromFile,
  getDocumentForUser,
  listDocuments,
  openDatabase,
  seedDemo,
  seedUsers,
  shareDocument,
  updateDocument,
} from '../lib/store';

describe('documents and sharing', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
    seedUsers(db);
  });

  it('hides a document until the owner shares it, then files it under shared', () => {
    const created = createDocument(db, 'user_alex', { title: 'Launch plan' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const before = getDocumentForUser(db, 'user_sam', created.document.id);
    expect(before.ok).toBe(false);
    if (!before.ok) expect(before.code).toBe('forbidden');

    const blocked = updateDocument(db, 'user_sam', created.document.id, { title: 'Hijack' });
    expect(blocked.ok).toBe(false);

    const shared = shareDocument(db, 'user_alex', created.document.id, 'sam@ajaia.test');
    expect(shared.ok).toBe(true);

    const after = getDocumentForUser(db, 'user_sam', created.document.id);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.document.role).toBe('editor');

    const samLibrary = listDocuments(db, 'user_sam');
    expect(samLibrary.shared.map((doc) => doc.id)).toContain(created.document.id);
    expect(samLibrary.owned.map((doc) => doc.id)).not.toContain(created.document.id);

    const alexLibrary = listDocuments(db, 'user_alex');
    expect(alexLibrary.owned.map((doc) => doc.id)).toContain(created.document.id);
    expect(alexLibrary.shared.map((doc) => doc.id)).not.toContain(created.document.id);
  });

  it('lets an editor change content and blocks them from sharing further', () => {
    const created = createDocument(db, 'user_alex', { title: 'Notes' });
    if (!created.ok) throw new Error('expected document');
    shareDocument(db, 'user_alex', created.document.id, 'Sam@Ajaia.test');

    const content = markdownToDoc('## Shipped\n\n- one');
    const updated = updateDocument(db, 'user_sam', created.document.id, {
      title: 'Notes from Sam',
      content,
    });
    expect(updated.ok).toBe(true);

    const reread = getDocumentForUser(db, 'user_alex', created.document.id);
    expect(reread.ok).toBe(true);
    if (reread.ok) {
      expect(reread.document.title).toBe('Notes from Sam');
      expect(reread.document.content).toEqual(content);
    }

    const reshare = shareDocument(db, 'user_sam', created.document.id, 'alex@ajaia.test');
    expect(reshare.ok).toBe(false);
    if (!reshare.ok) expect(reshare.code).toBe('owner-only');
  });

  it('treats a second share to the same person as success and rejects unknown emails', () => {
    const created = createDocument(db, 'user_alex', { title: 'Once' });
    if (!created.ok) throw new Error('expected document');

    expect(shareDocument(db, 'user_alex', created.document.id, 'sam@ajaia.test').ok).toBe(true);
    const again = shareDocument(db, 'user_alex', created.document.id, 'sam@ajaia.test');
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.document.collaborators).toHaveLength(1);

    const missing = shareDocument(db, 'user_alex', created.document.id, 'nope@ajaia.test');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(400);

    const self = shareDocument(db, 'user_alex', created.document.id, 'alex@ajaia.test');
    expect(self.ok).toBe(false);
  });

  it('imports markdown into a document the owner can reopen', () => {
    const created = createDocumentFromFile(db, 'user_alex', 'weekly-plan.md', '# Plan\n\n- ship the editor', 32);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.document.title).toBe('Weekly plan');
    expect(created.document.content.content[0]).toMatchObject({ type: 'heading' });

    const hidden = getDocumentForUser(db, 'user_sam', created.document.id);
    expect(hidden.ok).toBe(false);
  });

  it('signs in seeded users and rejects a wrong password', () => {
    expect(authenticate(db, 'alex@ajaia.test', 'demo1234')?.name).toBe('Alex Rivera');
    expect(authenticate(db, 'ALEX@ajaia.test', 'demo1234')?.id).toBe('user_alex');
    expect(authenticate(db, 'alex@ajaia.test', 'nope')).toBeNull();
    expect(authenticate(db, 'missing@ajaia.test', 'demo1234')).toBeNull();
  });

  it('seeds one welcome document on an empty database and does not duplicate it', () => {
    const fresh = openDatabase(':memory:');
    seedDemo(fresh);
    seedDemo(fresh);

    const alex = listDocuments(fresh, 'user_alex');
    const sam = listDocuments(fresh, 'user_sam');
    expect(alex.owned).toHaveLength(1);
    expect(alex.owned[0]?.title).toBe('Welcome to Ajaia Docs');
    expect(sam.owned).toHaveLength(0);
    expect(sam.shared).toHaveLength(1);

    const opened = getDocumentForUser(fresh, 'user_sam', sam.shared[0].id);
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.document.role).toBe('editor');
      expect(opened.document.content.content[0]).toMatchObject({ type: 'heading' });
    }
  });
});
