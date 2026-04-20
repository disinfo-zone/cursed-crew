import express from 'express';
import { createServer } from 'node:http';

import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { identityMiddleware } from './identity.js';
import { buildApiRouter } from './routes.js';
import { buildStaticHandlers } from './static.js';
import { attachWebSocket } from './ws.js';

const config = loadConfig();
const db = openDb(config.dbPath);

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('etag', 'strong');

app.use(express.json({ limit: '64kb' }));
app.use(identityMiddleware(db, config));

app.use(buildApiRouter(db));

const staticHandlers = buildStaticHandlers(config.clientDir);
app.use(staticHandlers.assets);
app.use(staticHandlers.spaFallback);

const server = createServer(app);
const ws = attachWebSocket(server, db, config);

server.listen(config.port, () => {
  console.log(
    `[cursed-crew] listening on :${config.port} — db=${config.dbPath} client=${config.clientDir}`
  );
});

function shutdown(signal: NodeJS.Signals) {
  console.log(`[cursed-crew] ${signal} — striking sail`);
  ws.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[cursed-crew] forced exit');
    process.exit(1);
  }, 5000).unref();
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => shutdown(signal));
}
