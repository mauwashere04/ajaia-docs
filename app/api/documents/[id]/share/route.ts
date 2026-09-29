import { jsonError, readJson, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { getDb, removeShare, shareDocument } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const body = await readJson(request);
  const email = body && typeof body === 'object' && 'email' in body ? body.email : undefined;
  const role = body && typeof body === 'object' && 'role' in body ? body.role : undefined;
  const { id } = await context.params;
  const result = shareDocument(getDb(), user.id, id, email, role);
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ document: result.document });
}

export async function DELETE(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const body = await readJson(request);
  const email = body && typeof body === 'object' && 'email' in body ? body.email : undefined;
  const { id } = await context.params;
  const result = removeShare(getDb(), user.id, id, email);
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ document: result.document });
}
