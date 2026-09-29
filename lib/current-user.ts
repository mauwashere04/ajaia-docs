import { cookies } from 'next/headers';
import { COOKIE_NAME, readSession } from './session-token';
import { findUserById, getDb } from './store';

export async function currentUser() {
  const jar = await cookies();
  const userId = readSession(jar.get(COOKIE_NAME)?.value);
  if (!userId) return null;
  return findUserById(getDb(), userId);
}

export async function hasSessionCookie() {
  const jar = await cookies();
  return Boolean(readSession(jar.get(COOKIE_NAME)?.value));
}
