/**
 * Runtime config, read from environment once at boot. Centralized so we can
 * enumerate knobs and avoid scattering process.env reads across the codebase.
 */

import { resolve } from 'node:path';

export type Config = {
  port: number;
  dbPath: string;
  clientDir: string;
  cookieSecure: boolean;
  cookieName: string;
  cookieMaxAgeMs: number;
  trustProxy: boolean;
  isProduction: boolean;
};

function boolEnv(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Env ${name} must be an integer, got: ${v}`);
  }
  return n;
}

export function loadConfig(): Config {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    port: intEnv('PORT', 8080),
    dbPath: process.env.DB_PATH ?? resolve('./data/cursedcrew.db'),
    clientDir: process.env.CLIENT_DIR ?? resolve('../client/build'),
    cookieSecure: boolEnv('COOKIE_SECURE', isProduction),
    cookieName: process.env.COOKIE_NAME ?? 'cc_uid',
    // Ten years, effectively permanent for a friends-group tool.
    cookieMaxAgeMs: intEnv('COOKIE_MAX_AGE_MS', 10 * 365 * 24 * 60 * 60 * 1000),
    // When terminated behind Cloudflare Tunnel, trust the upgrade headers
    // (X-Forwarded-Proto etc.) so req.secure works.
    trustProxy: boolEnv('TRUST_PROXY', isProduction),
    isProduction
  };
}
