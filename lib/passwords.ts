import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';

const KEY_LENGTH = 32;
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, KEY_LENGTH, SCRYPT);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(actual, expected);
}

export const DUMMY_PASSWORD_HASH = hashPassword('not-a-real-account');
