import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { startBackupSchedule } from './backup';
import { config } from './config';
import { db } from './db';
import { adminRoutes } from './routes/admin';
import { publicRoutes } from './routes/public';

const app = new Hono();

if (process.env.NODE_ENV !== 'production') {
  app.use('*', logger());
}

app.route('/', publicRoutes);
app.route('/', adminRoutes);

let widgetSource: string | null = null;

app.get('/w.js', (c) => {
  const isProd = process.env.NODE_ENV === 'production';
  if (!widgetSource || !isProd) {
    try {
      widgetSource = readFileSync(resolve('dist/w.js'), 'utf8');
    } catch {
      return c.text('widget not built; run pnpm build', 503);
    }
  }

  return c.body(widgetSource, 200, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': isProd ? 'public, max-age=300' : 'no-store',
  });
});

app.get('/snapdom.js', (c) => {
  try {
    const source = readFileSync(resolve('dist/snapdom.js'), 'utf8');
    return c.body(source, 200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    });
  } catch {
    return c.text('snapdom not built; run pnpm build', 503);
  }
});

app.use('/assets/*', serveStatic({ root: './dist/admin' }));

app.get('/favicon.svg', serveStatic({ path: './dist/admin/favicon.svg' }));

app.get('*', (c, next) => {
  const path = c.req.path;
  if (path.startsWith('/api') || path.startsWith('/uploads') || path === '/w.js') return next();
  return serveStatic({ path: './dist/admin/index.html' })(c, next);
});

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: '服务器内部错误' }, 500);
});

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(`mini-feedback listening on http://${info.address}:${info.port}`);
  },
);

startBackupSchedule();

let closing = false;

function shutdown(): void {
  if (closing) return;
  closing = true;

  server.close(() => {
    db.close();
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
