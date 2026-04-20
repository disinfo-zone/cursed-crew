import { randomUUID, randomBytes } from 'node:crypto';

/** UUID v4 via Node's crypto. */
export function uuid(): string {
  return randomUUID();
}

/**
 * URL-safe random id, used for user cookies.
 *
 * 24 bytes → 32 base64url chars. Plenty of entropy to serve as an unguessable
 * identity token without server-side session state.
 */
export function userToken(): string {
  return randomBytes(24).toString('base64url');
}
