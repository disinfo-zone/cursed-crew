#!/usr/bin/env node
/**
 * Copy the authoritative reducer and type definitions out of /server/src and
 * into /client/src/lib/shared. Runs before `dev` and `build` so the client
 * always imports byte-identical copies of what the server actually applies —
 * no drift between optimistic updates and the broadcast that comes back.
 *
 * If the reducer ever needs to diverge (e.g., the client wants a fast-path
 * for UI-only state), stop syncing and write an explicit adapter layer —
 * don't let the two copies drift silently.
 */

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '..');
const serverSrc = resolve(clientRoot, '..', 'server', 'src');
const sharedDir = join(clientRoot, 'src', 'lib', 'shared');

mkdirSync(sharedDir, { recursive: true });

const files = ['types.ts', 'reducer.ts'];
const header = [
  '// !! AUTO-GENERATED — do not edit by hand.',
  '// Synced from /server/src by /client/scripts/sync-shared.mjs on every dev/build.',
  '// Edit the source in /server/src and re-run the script.',
  ''
].join('\n');

for (const file of files) {
  const src = join(serverSrc, file);
  const dest = join(sharedDir, file);
  const body = readFileSync(src, 'utf8');
  writeFileSync(dest, header + body, 'utf8');
  console.log(`sync-shared: ${file}`);
}
