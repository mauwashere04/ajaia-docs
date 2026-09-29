import type { DocContent, StoreError } from './types';

const CONTENT_LIMIT = 500_000;

export function normalizeTitle(input: unknown): { ok: true; title: string } | StoreError {
  if (typeof input !== 'string') {
    return { ok: false, status: 400, code: 'invalid', error: 'Title must be text.' };
  }
  const title = input.trim().replace(/\s+/g, ' ');
  if (!title) return { ok: true, title: 'Untitled' };
  if (title.length > 120) {
    return { ok: false, status: 400, code: 'invalid', error: 'Title must be 120 characters or fewer.' };
  }
  return { ok: true, title };
}

export function normalizeContent(input: unknown): { ok: true; content: DocContent } | StoreError {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, status: 400, code: 'invalid', error: 'Document content is invalid.' };
  }
  const candidate = input as { type?: unknown; content?: unknown };
  if (candidate.type !== 'doc' || !Array.isArray(candidate.content)) {
    return { ok: false, status: 400, code: 'invalid', error: 'Document content is invalid.' };
  }
  const content = candidate as DocContent;
  if (JSON.stringify(content).length > CONTENT_LIMIT) {
    return { ok: false, status: 400, code: 'invalid', error: 'Document is too large to save.' };
  }
  return { ok: true, content };
}
