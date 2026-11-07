import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clientIp } from '../http';
import { config } from '../config';
import { decodeDataImage } from '../image';
import { rateLimit } from '../rate-limit';
import { createFeedback, getMyFeedback, isKind } from '../store';
import { newId } from '../util';

export const publicRoutes = new Hono();

const corsOptions = {
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['content-type'],
};

publicRoutes.use('/api/feedback', cors(corsOptions));
publicRoutes.use('/api/my', cors(corsOptions));
publicRoutes.use('/api/health', cors(corsOptions));

publicRoutes.post(
  '/api/feedback',
  bodyLimit({
    maxSize: 6 * 1024 * 1024,
    onError: (c) => c.json({ error: '内容太大了' }, 413),
  }),
  async (c) => {
    if (!rateLimit(`submit:${clientIp(c)}`, 60)) {
      return c.json({ error: '提交太频繁，稍后再试' }, 429);
    }

    const payload = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) return c.json({ error: '请求格式不对' }, 400);

    const project = String(payload.project ?? '').trim();
    if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(project)) {
      return c.json({ error: 'project 必须是 1-40 位小写 slug' }, 400);
    }

    const body = String(payload.body ?? '').trim();
    if (!body) return c.json({ error: '内容不能为空' }, 400);
    if (body.length > 4000) return c.json({ error: '内容超过 4000 字' }, 400);

    const kind = isKind(payload.kind) ? payload.kind : 'bug';
    const reporterRaw = typeof payload.reporter === 'string' ? payload.reporter.trim().slice(0, 40) : '';
    const reporter = reporterRaw || null;

    let context: Record<string, unknown> = {};
    if (payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context)) {
      context = payload.context as Record<string, unknown>;
    }
    const contextJson = JSON.stringify(context);
    if (contextJson.length > 120_000) return c.json({ error: '现场信息太大了' }, 400);

    let image: { buffer: Buffer; ext: string } | null = null;
    try {
      image = decodeDataImage(payload.image);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }

    const id = newId();
    const screenshotFile = image ? `${id}.${image.ext}` : null;
    if (image && screenshotFile) {
      await writeFile(join(config.dataDir, 'uploads', screenshotFile), image.buffer);
    }

    const feedback = createFeedback({
      id,
      project,
      kind,
      body,
      reporter,
      context: contextJson,
      screenshotFile,
    });

    return c.json({ id: feedback.id }, 200);
  },
);

publicRoutes.post('/api/my', async (c) => {
  if (!rateLimit(`my:${clientIp(c)}`, 120)) {
    return c.json({ error: '请求太频繁' }, 429);
  }

  const payload = (await c.req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(payload?.ids)
    ? payload.ids.filter((id): id is string => typeof id === 'string').slice(0, 50)
    : [];

  return c.json({ items: getMyFeedback(ids) });
});

publicRoutes.get('/api/health', (c) => c.json({ ok: true, name: 'mini-feedback' }));
