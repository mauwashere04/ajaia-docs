import { jsonError, readJson, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { getDb, updateProfile } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  return Response.json({ user });
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const body = await readJson(request);
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const result = updateProfile(getDb(), user.id, {
    name: payload.name,
    email: payload.email,
    currentPassword: payload.currentPassword,
    newPassword: payload.newPassword,
  });
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ user: result.user });
}
