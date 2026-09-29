import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'ajaia_session';

export function sessionSecret(): string {
  return process.env.SESSION_SECRET || 'ajaia-docs-local-dev-secret';
}

export function signSession(userId: string): string {
  const signature = createHmac('sha256', sessionSecret()).update(userId).digest('base64url');
  return `${userId}.${signature}`;
}

export function readSession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac('sha256', sessionSecret()).update(userId).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return userId || null;
}

export function sessionCookieOptions(maxAge = 60 * 60 * 24 * 14) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.SESSION_SECURE === 'true',
    maxAge,
  };
}
