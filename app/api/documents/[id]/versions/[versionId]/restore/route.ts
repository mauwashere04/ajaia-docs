import { jsonError, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { getDb, restoreVersion } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; versionId: string }> };

export async function POST(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const { id, versionId } = await context.params;
  const result = restoreVersion(getDb(), user.id, id, versionId);
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ document: result.document });
}
