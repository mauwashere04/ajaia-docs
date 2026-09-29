import { cookies } from 'next/headers';
import { COOKIE_NAME, sessionCookieOptions } from '@/lib/session-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, '', sessionCookieOptions(0));
  return Response.json({ ok: true });
}
