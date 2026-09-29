import { jsonError, readJson, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { getDb, heartbeat } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const body = await readJson(request);
  const payload =
    body && typeof body === 'object'
      ? (body as { from?: unknown; to?: unknown; content?: unknown; title?: unknown; baseUpdatedAt?: unknown })
      : {};
  const { id } = await context.params;
  const result = heartbeat(getDb(), user.id, id, new Date(), payload);
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({
    viewers: result.viewers,
    updatedAt: result.updatedAt,
    updatedBy: result.updatedBy,
    title: result.title,
    content: result.content,
  });
}
