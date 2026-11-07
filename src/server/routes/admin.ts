import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  actorOf,
  isBearer,
  isHttps,
  issueSession,
  requireAdmin,
  SESSION_COOKIE,
  SESSION_TTL,
  sameOrigin,
  safeEqual,
  verifySession,
} from '../auth';
import { config } from '../config';
import { clientIp } from '../http';
import { rateLimit } from '../rate-limit';
import {
  getEvents,
  getFeedback,
  isDelivery,
  isKind,
  isNextAction,
  isStatus,
  listAllForCsv,
  listFeedback,
  listForExport,
  listProjects,
  statusCounts,
  updateFeedback,
  type Delivery,
  type NextAction,
  type Status,
} from '../store';
import { csvCell, iso } from '../util';

export const adminRoutes = new Hono();

adminRoutes.post('/api/login', async (c) => {
  if (!rateLimit(`login:${clientIp(c)}`, 10)) {
    return c.json({ error: '尝试太频繁，稍后再试' }, 429);
  }

  const payload = (await c.req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof payload?.password === 'string' ? payload.password : '';
  if (!safeEqual(password, config.password)) {
    return c.json({ error: '密码不对' }, 401);
  }

  setCookie(c, SESSION_COOKIE, issueSession(), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL / 1000,
    secure: isHttps(c),
  });

  return c.json({ ok: true });
});

adminRoutes.post('/api/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

adminRoutes.get('/api/session', (c) => {
  const bearer = isBearer(c);
  const cookie = verifySession(getCookie(c, SESSION_COOKIE));
  return c.json({
    authed: bearer || cookie,
    actor: bearer ? 'dsh' : cookie ? 'me' : null,
  });
});

adminRoutes.use('/api/*', requireAdmin);
adminRoutes.use('/uploads/*', requireAdmin);

adminRoutes.get('/api/feedback', (c) => {
  const status = c.req.query('status') ?? '';
  if (status && !status.split(',').every(isStatus)) {
    return c.json({ error: '状态不对' }, 400);
  }

  const kind = c.req.query('kind') ?? '';
  if (kind && !isKind(kind)) {
    return c.json({ error: '类型不对' }, 400);
  }

  const limit = Math.min(500, Math.max(1, Number.parseInt(c.req.query('limit') ?? '', 10) || 100));
  const offset = Math.max(0, Number.parseInt(c.req.query('offset') ?? '', 10) || 0);
  const project = c.req.query('project')?.trim() || undefined;
  const q = c.req.query('q')?.trim() || undefined;
  const nextAction = c.req.query('next_action') ?? '';
  if (nextAction && !isNextAction(nextAction)) {
    return c.json({ error: 'next_action 不对' }, 400);
  }

  const { items, total } = listFeedback({
    project,
    status: status || undefined,
    kind: kind || undefined,
    q,
    nextAction: nextAction || undefined,
    limit,
    offset,
  });

  return c.json({ items, total, stats: statusCounts(project) });
});

adminRoutes.get('/api/feedback/:id', (c) => {
  const feedback = getFeedback(c.req.param('id'));
  if (!feedback) return c.json({ error: '找不到这条反馈' }, 404);
  return c.json({ feedback, events: getEvents(feedback.id) });
});

adminRoutes.patch('/api/feedback/:id', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: '跨站请求被拒绝' }, 403);

  const payload = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return c.json({ error: '请求格式不对' }, 400);

  if (payload.status !== undefined && !isStatus(payload.status)) {
    return c.json({ error: '状态不对' }, 400);
  }

  if (
    payload.next_action !== undefined &&
    payload.next_action !== null &&
    !isNextAction(payload.next_action)
  ) {
    return c.json({ error: 'next_action 不对' }, 400);
  }

  if (payload.delivery !== undefined && payload.delivery !== null && !isDelivery(payload.delivery)) {
    return c.json({ error: 'delivery 不对' }, 400);
  }

  let auto: boolean | undefined;
  if (payload.auto !== undefined) {
    if (typeof payload.auto === 'boolean') auto = payload.auto;
    else if (payload.auto === 0 || payload.auto === 1) auto = payload.auto === 1;
    else return c.json({ error: 'auto 不对' }, 400);
  }

  const limits: Array<[string, number]> = [
    ['resolution', 1000],
    ['analysis', 4000],
    ['plan', 4000],
    ['assignee', 120],
    ['agent_session', 200],
    ['fix_ref', 200],
    ['note', 2000],
  ];

  const values: Record<string, string | null | undefined> = {};
  for (const [key, max] of limits) {
    const raw = payload[key];
    if (raw === undefined) {
      values[key] = undefined;
      continue;
    }
    if (raw !== null && typeof raw !== 'string') {
      return c.json({ error: `${key} 格式不对` }, 400);
    }
    const trimmed = String(raw ?? '').trim();
    if (trimmed.length > max) {
      return c.json({ error: `${key} 超过 ${max} 字` }, 400);
    }
    values[key] = trimmed || null;
  }

  const hasChange =
    payload.status !== undefined ||
    payload.next_action !== undefined ||
    payload.delivery !== undefined ||
    payload.auto !== undefined ||
    Object.values(values).some((value) => value !== undefined);
  if (!hasChange) return c.json({ error: '没有要改的内容' }, 400);

  const updated = updateFeedback(
    c.req.param('id'),
    {
      status: payload.status as Status | undefined,
      resolution: values.resolution,
      analysis: values.analysis,
      plan: values.plan,
      assignee: values.assignee,
      agent_session: values.agent_session,
      fix_ref: values.fix_ref,
      auto,
      next_action:
        payload.next_action === undefined ? undefined : (payload.next_action as NextAction | null),
      delivery: payload.delivery === undefined ? undefined : (payload.delivery as Delivery | null),
      note: values.note,
    },
    actorOf(c),
  );
  if (!updated) return c.json({ error: '找不到这条反馈' }, 404);

  return c.json({ feedback: updated, events: getEvents(updated.id) });
});

adminRoutes.get('/api/projects', (c) => c.json({ items: listProjects() }));

adminRoutes.get('/api/export', (c) => {
  const rawSince = Number(c.req.query('since') ?? 0);
  const since = Number.isFinite(rawSince) && rawSince > 0 ? Math.floor(rawSince) : 0;

  const status = c.req.query('status') ?? '';
  if (status && !isStatus(status)) return c.json({ error: '状态不对' }, 400);

  const limit = Math.min(500, Math.max(1, Number.parseInt(c.req.query('limit') ?? '', 10) || 200));
  const items = listForExport(since, status || undefined, limit).map((item) => ({
    ...item,
    screenshot_url: item.screenshot ? `${config.publicBaseUrl}${item.screenshot}` : null,
  }));

  return c.json({
    items,
    next_since: items.length ? items[items.length - 1]!.updated_at : since,
  });
});

adminRoutes.get('/api/export.csv', (c) => {
  const header = [
    'id',
    'project',
    'kind',
    'status',
    'body',
    'reporter',
    'resolution',
    'analysis',
    'plan',
    'fix_ref',
    'auto',
    'next_action',
    'delivery',
    'created_at',
    'updated_at',
    'screenshot_url',
  ];

  const lines = listAllForCsv().map((item) =>
    [
      item.id,
      item.project,
      item.kind,
      item.status,
      item.body,
      item.reporter,
      item.resolution,
      item.analysis,
      item.plan,
      item.fix_ref,
      item.auto ? '1' : '0',
      item.next_action,
      item.delivery,
      iso(item.created_at),
      iso(item.updated_at),
      item.screenshot ? `${config.publicBaseUrl}${item.screenshot}` : '',
    ]
      .map(csvCell)
      .join(','),
  );

  const csv = `\uFEFF${[header.map(csvCell).join(','), ...lines].join('\r\n')}`;

  return c.body(csv, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="mini-feedback.csv"',
  });
});

adminRoutes.get('/uploads/:file', async (c) => {
  const file = c.req.param('file');
  const match = /^([A-Za-z0-9_-]+)\.(jpg|png|webp)$/.exec(file);
  if (!match) return c.json({ error: '找不到文件' }, 404);

  const path = join(config.dataDir, 'uploads', file);
  if (!existsSync(path)) return c.json({ error: '找不到文件' }, 404);

  const data = await readFile(path);
  const type = match[2] === 'png' ? 'image/png' : match[2] === 'webp' ? 'image/webp' : 'image/jpeg';

  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': type,
      'cache-control': 'private, max-age=86400',
    },
  });
});
