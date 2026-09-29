import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { jsonError } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { uploadsDirectory } from '@/lib/uploads-dir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

type Context = { params: Promise<{ name: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const { name } = await context.params;
  const match = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/i.exec(name);
  if (!match) return jsonError('Image not found.', 404);
  try {
    const bytes = await readFile(join(uploadsDirectory(), name));
    return new Response(bytes, {
      headers: {
        'Content-Type': TYPES[match[1].toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return jsonError('Image not found.', 404);
  }
}
