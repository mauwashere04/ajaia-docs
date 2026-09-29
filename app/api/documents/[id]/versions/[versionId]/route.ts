import { jsonError, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { getDb, getVersion } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; versionId: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const { id, versionId } = await context.params;
  const result = getVersion(getDb(), user.id, id, versionId);
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ version: result.version });
}
