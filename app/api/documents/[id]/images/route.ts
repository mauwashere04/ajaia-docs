import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { jsonError, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { getDb, getDocumentForUser } from '@/lib/store';
import { uploadsDirectory } from '@/lib/uploads-dir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const { id } = await context.params;
  const existing = getDocumentForUser(getDb(), user.id, id);
  if (!existing.ok) return storeErrorResponse(existing);
  if (existing.document.role === 'viewer') return jsonError('View access cannot add images.', 403);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return jsonError('Choose an image file.', 400);
  const extension = TYPES[file.type];
  if (!extension) return jsonError('Use a PNG, JPEG, GIF, or WebP image.', 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) return jsonError('That image is empty.', 400);
  if (bytes.byteLength > MAX_BYTES) return jsonError('Images must be 2 MB or smaller.', 400);

  const name = `${randomUUID()}.${extension}`;
  const directory = uploadsDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), bytes);
  return Response.json({ url: `/api/media/${name}`, alt: file.name || 'Image' });
}
