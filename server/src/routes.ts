import { Router, type Request, type Response } from 'express';

import type { DbHandle } from './db.js';
import { isValidCrewCodeShape } from './names.js';

const MAX_CREW_NAME = 80;
const MAX_SHIP_NAME = 80;
const MAX_DISPLAY_NAME = 40;

type CreateCrewBody = {
  name?: unknown;
  shipName?: unknown;
  displayName?: unknown;
};

function normalizeName(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  // Strip control characters just in case a stray ^C or \0 slips in.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return null;
  return trimmed;
}

function normalizeOptionalName(value: unknown, maxLen: number): string | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return normalizeName(value, maxLen);
}

export function buildApiRouter(db: DbHandle): Router {
  const r = Router();

  r.get('/healthz', (_req, res) => {
    res.type('text/plain').send('OK');
  });

  /**
   * POST /api/crew
   * Body: { name: string, shipName?: string, displayName?: string }
   * Creates a crew owned (captain) by the cookie-identified user. Returns the
   * generated thematic crew code.
   */
  r.post('/api/crew', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as CreateCrewBody;

    const name = normalizeName(body.name, MAX_CREW_NAME);
    if (!name) {
      res.status(400).json({ error: 'invalid_name' });
      return;
    }

    const shipNameOrNull = normalizeOptionalName(body.shipName, MAX_SHIP_NAME);
    if (shipNameOrNull === null) {
      res.status(400).json({ error: 'invalid_ship_name' });
      return;
    }

    const displayNameOrNull = normalizeOptionalName(body.displayName, MAX_DISPLAY_NAME);
    if (displayNameOrNull === null) {
      res.status(400).json({ error: 'invalid_display_name' });
      return;
    }

    try {
      const created = db.createCrew({
        name,
        shipName: shipNameOrNull,
        creatorUserId: req.userId,
        creatorDisplayName: displayNameOrNull
      });
      res.status(201).json({
        code: created.code,
        name: created.row.name
      });
    } catch (err) {
      req.log?.error?.(err);
      console.error('[createCrew]', err);
      res.status(500).json({ error: 'create_failed' });
    }
  });

  /**
   * GET /api/crew/:code
   * Lightweight existence/name check for link previews. Full state is served
   * via the WebSocket handshake, not here.
   */
  r.get('/api/crew/:code', (req: Request<{ code: string }>, res: Response) => {
    const code = req.params.code;
    if (!code || typeof code !== 'string' || !isValidCrewCodeShape(code)) {
      res.status(400).json({ exists: false, error: 'invalid_code_shape' });
      return;
    }
    const crew = db.getCrew(code);
    if (!crew) {
      res.status(404).json({ exists: false });
      return;
    }
    res.json({ exists: true, name: crew.row.name });
  });

  /**
   * GET /api/me
   * Returns the identity the server has for this browser. Used by the landing
   * page to pre-fill the display name if we've seen this device before, and
   * by the ledger to list which crews this browser already has memberships in.
   */
  r.get('/api/me', (req: Request, res: Response) => {
    const user = db.getUser(req.userId);
    const crews = db.listUserCrews(req.userId).map((c) => ({
      code: c.code,
      name: c.name,
      lastSeenAt: c.lastSeenAt
    }));
    res.json({
      userId: req.userId,
      displayName: user?.displayName ?? '',
      crews
    });
  });

  return r;
}

// Augment Express typings minimally so `req.log?.error?.(...)` stays typed if
// we later attach a logger. Keeps the route code forward-compatible without
// pulling in a logging dep today.
declare module 'express-serve-static-core' {
  interface Request {
    log?: { error?: (err: unknown) => void };
  }
}
