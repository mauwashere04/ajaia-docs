import { cookies } from 'next/headers';
import { jsonError } from '@/lib/http';
import { COOKIE_NAME, sessionCookieOptions, signSession } from '@/lib/session-token';
import { authenticate, getDb } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Enter your email and password.', 400);
  }
  if (!body || typeof body !== 'object') return jsonError('Enter your email and password.', 400);

  const { email, password } = body as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return jsonError('Enter your email and password.', 400);
  }

  const user = authenticate(getDb(), email, password);
  if (!user) return jsonError('Email or password does not match a seeded account.', 401);

  const jar = await cookies();
  jar.set(COOKIE_NAME, signSession(user.id), sessionCookieOptions());
  return Response.json({ user });
}
