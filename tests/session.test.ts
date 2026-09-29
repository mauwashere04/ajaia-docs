import { describe, expect, it } from 'vitest';
import { readSession, signSession } from '../lib/session-token';

describe('session tokens', () => {
  it('round-trips a user id', () => {
    expect(readSession(signSession('user_alex'))).toBe('user_alex');
  });

  it('rejects a token whose user id was swapped', () => {
    const token = signSession('user_alex');
    const swapped = token.replace('user_alex', 'user_sam');
    expect(readSession(swapped)).toBeNull();
  });
});
