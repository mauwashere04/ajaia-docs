import { jsonError, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { getDb, listVersions } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const { id } = await context.params;
  const result = listVersions(getDb(), user.id, id);
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ versions: result.versions });
}
