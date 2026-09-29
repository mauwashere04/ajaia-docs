import { jsonError, readJson, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { getDb, getDocumentForUser, updateDocument } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const { id } = await context.params;
  const result = getDocumentForUser(getDb(), user.id, id);
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ document: result.document });
}

export async function PATCH(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const body = await readJson(request);
  if (!body || typeof body !== 'object') return jsonError('Document changes must be JSON.', 400);

  const patch = body as { title?: unknown; content?: unknown };
  const { id } = await context.params;
  const result = updateDocument(getDb(), user.id, id, patch);
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ document: result.document });
}
