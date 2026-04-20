import express, { type RequestHandler, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * Static file serving for the SvelteKit static build. Long-cache immutable
 * assets, no-cache the HTML entry point, and SPA-fallback anything that
 * doesn't hit a real file so client-side routing (/c/<code>) resolves.
 */
export function buildStaticHandlers(clientDirInput: string): {
  assets: RequestHandler;
  spaFallback: RequestHandler;
} {
  const clientDir = isAbsolute(clientDirInput)
    ? clientDirInput
    : resolve(process.cwd(), clientDirInput);

  if (!existsSync(clientDir)) {
    console.warn(
      `[static] client dir does not exist: ${clientDir} — did the frontend build run?`
    );
  }

  const assets = express.static(clientDir, {
    etag: true,
    lastModified: true,
    maxAge: 0,
    index: false,
    setHeaders(res, path) {
      // SvelteKit emits hashed filenames under _app/immutable/**, safe to
      // cache forever.
      if (path.includes(`${'_app'}${pathSep()}immutable`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      if (path.endsWith('.woff2') || path.endsWith('.woff')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
  });

  const indexHtml = join(clientDir, 'index.html');

  const spaFallback: RequestHandler = (req: Request, res: Response, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) return next();
    if (!existsSync(indexHtml)) {
      res.status(503).type('text/plain').send('Client build missing.');
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  };

  return { assets, spaFallback };
}

function pathSep(): string {
  // Express static serves using the OS path separator. On Windows that's \;
  // on Linux it's /. Match the real thing so our cache rules fire there too.
  return process.platform === 'win32' ? '\\' : '/';
}
