/**
 * Thin typed wrappers around the /api HTTP endpoints. Any state that flows
 * during a ledger session goes over the WebSocket — this module is only for
 * crew creation, initial identity probe, and link previews.
 */

export type Me = {
  userId: string;
  displayName: string;
  crews: Array<{ code: string; name: string; lastSeenAt: number }>;
};

export type CreateCrewPayload = {
  name: string;
  shipName?: string;
  displayName?: string;
};

export type CreateCrewResult = {
  code: string;
  name: string;
};

export type CrewPreview =
  | { exists: true; name: string }
  | { exists: false };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, 'bad_response', `Non-JSON response: ${text.slice(0, 120)}`);
  }
  if (!res.ok) {
    const errCode =
      typeof body === 'object' && body !== null && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `http_${res.status}`;
    throw new ApiError(res.status, errCode);
  }
  return body as T;
}

export async function fetchMe(): Promise<Me> {
  const r = await fetch('/api/me', { credentials: 'same-origin' });
  return handle<Me>(r);
}

export async function createCrew(payload: CreateCrewPayload): Promise<CreateCrewResult> {
  const r = await fetch('/api/crew', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle<CreateCrewResult>(r);
}

export async function fetchCrewPreview(code: string): Promise<CrewPreview> {
  const r = await fetch(`/api/crew/${encodeURIComponent(code)}`, {
    credentials: 'same-origin'
  });
  if (r.status === 404) return { exists: false };
  return handle<CrewPreview>(r);
}

/**
 * Pull a crew code out of either a bare code ("bloody-kraken-rum") or a full
 * URL ("https://cursedcrew.example.com/c/bloody-kraken-rum"). Returns null if
 * the input doesn't parse to a valid shape.
 */
export function parseCrewCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Try URL first.
  try {
    const u = new URL(trimmed);
    const m = u.pathname.match(/\/c\/([^/?#]+)/);
    if (m && m[1]) return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    // not a URL — fall through to bare-code path
  }
  // Strip any leading path or slash the user might have typed.
  const tail = trimmed.split('/').filter(Boolean).pop() ?? '';
  const normalized = decodeURIComponent(tail).toLowerCase();
  return /^[a-z]{3,14}-[a-z]{3,14}-[a-z]{3,14}$/.test(normalized) ? normalized : null;
}
