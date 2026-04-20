import type { RequestHandler } from 'express';
import { parse as parseCookie } from 'cookie';

import type { Config } from './config.js';
import type { DbHandle } from './db.js';
import { userToken } from './ids.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

/**
 * Mints and attaches an anonymous, long-lived user id on every inbound request.
 *
 * A crew code is the access token to a crew; the user cookie is the stable
 * identity across visits — it anchors rows in users/crew_members, powers the
 * "which crews have I joined?" list, and (in the future) lets us attribute log
 * entries, cursor positions, or audit trails per device.
 *
 * Security stance: HttpOnly (no JS access), SameSite=Lax (safe cross-site
 * navigation but blocks CSRF on cookie-bearing POSTs from third parties),
 * Secure in production (Cloudflare terminates TLS at the edge). The token
 * itself is 24 bytes of CSPRNG — effectively unguessable.
 */
export function identityMiddleware(db: DbHandle, config: Config): RequestHandler {
  return (req, res, next) => {
    const cookies = parseCookie(req.headers.cookie ?? '');
    const existing = cookies[config.cookieName];
    const valid =
      typeof existing === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(existing);

    const userId = valid ? (existing as string) : userToken();
    const now = Date.now();

    if (!valid) {
      db.upsertUser(userId, '', now);
      res.cookie(config.cookieName, userId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        maxAge: config.cookieMaxAgeMs
      });
    } else {
      // Refresh last_seen so dormant users eventually age out if we add cleanup.
      db.upsertUser(userId, '', now);
    }

    req.userId = userId;
    next();
  };
}
