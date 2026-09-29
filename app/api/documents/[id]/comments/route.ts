import { jsonError, readJson, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { addComment, getDb, listComments, resolveComment } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const { id } = await context.params;
  const result = listComments(getDb(), user.id, id);
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ comments: result.comments });
}

export async function POST(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const body = await readJson(request);
  const payload = body && typeof body === 'object' ? (body as { body?: unknown; quote?: unknown; commentId?: unknown }) : {};
  const { id } = await context.params;
  if (typeof payload.commentId === 'string') {
    const result = resolveComment(getDb(), user.id, id, payload.commentId);
    if (!result.ok) return storeErrorResponse(result);
    return Response.json({ comments: result.comments });
  }
  const result = addComment(getDb(), user.id, id, { body: payload.body, quote: payload.quote });
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ comments: result.comments }, { status: 201 });
}
