import { jsonError } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { getDb, listUsers } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  return Response.json({ users: listUsers(getDb()) });
}
