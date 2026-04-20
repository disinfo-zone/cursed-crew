#!/usr/bin/env node
// Discovers *.test.ts under src/ and runs them via node --test with tsx.
// Node's built-in --test discovery only matches .js files, so we walk the
// tree ourselves and pass explicit file args.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const files = walk(join(root, 'src'));

if (files.length === 0) {
  console.log('No .test.ts files found under src/.');
  process.exit(0);
}

const child = spawn(
  process.execPath,
  ['--import', 'tsx', '--test', ...files],
  { stdio: 'inherit', cwd: root }
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
