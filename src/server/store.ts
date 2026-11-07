import { join } from 'node:path';
import { config } from './config';
import { db } from './db';

export const STATUSES = ['open', 'doing', 'located', 'needs_info', 'done', 'wontfix'] as const;
export type Status = (typeof STATUSES)[number];

export const NEXT_ACTIONS = ['fix', 'info', 'deploy'] as const;
export type NextAction = (typeof NEXT_ACTIONS)[number];

export const DELIVERIES = ['branch', 'merged', 'deployed'] as const;
export type Delivery = (typeof DELIVERIES)[number];

export const KINDS = ['bug', 'idea', 'other'] as const;
export type Kind = (typeof KINDS)[number];

export interface Feedback {
  id: string;
  project: string;
  kind: Kind;
  status: Status;
  body: string;
  reporter: string | null;
  context: unknown;
  screenshot: string | null;
  screenshot_path: string | null;
  resolution: string | null;
  analysis: string | null;
  plan: string | null;
  assignee: string | null;
  agent_session: string | null;
  fix_ref: string | null;
  auto: boolean;
  next_action: NextAction | null;
  delivery: Delivery | null;
  created_at: number;
  updated_at: number;
}

export interface FeedbackEvent {
  id: number;
  type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor: string;
  created_at: number;
}

export interface FeedbackPatch {
  status?: Status;
  resolution?: string | null;
  analysis?: string | null;
  plan?: string | null;
  assignee?: string | null;
  agent_session?: string | null;
  fix_ref?: string | null;
  auto?: boolean;
  next_action?: NextAction | null;
  delivery?: Delivery | null;
  note?: string | null;
}

interface FeedbackRow {
  id: string;
  project_id: string;
  kind: Kind;
  status: Status;
  body: string;
  reporter: string | null;
  context: string;
  screenshot_path: string | null;
  resolution: string | null;
  analysis: string | null;
  plan: string | null;
  assignee: string | null;
  agent_session: string | null;
  fix_ref: string | null;
  auto: number;
  next_action: NextAction | null;
  delivery: Delivery | null;
  created_at: number;
  updated_at: number;
}

const SELECT = `id, project_id, kind, status, body, reporter, context, screenshot_path,
  resolution, analysis, plan, assignee, agent_session, fix_ref, auto, next_action, delivery,
  created_at, updated_at`;

function parseContext(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function rowToFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    project: row.project_id,
    kind: row.kind,
    status: row.status,
    body: row.body,
    reporter: row.reporter,
    context: parseContext(row.context),
    screenshot: row.screenshot_path ? `/uploads/${row.screenshot_path}` : null,
    screenshot_path: row.screenshot_path ? join(config.dataDir, 'uploads', row.screenshot_path) : null,
    resolution: row.resolution,
    analysis: row.analysis,
    plan: row.plan,
    assignee: row.assignee,
    agent_session: row.agent_session,
    fix_ref: row.fix_ref,
    auto: row.auto === 1,
    next_action: row.next_action,
    delivery: row.delivery,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export function isKind(value: unknown): value is Kind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

export function isNextAction(value: unknown): value is NextAction {
  return typeof value === 'string' && (NEXT_ACTIONS as readonly string[]).includes(value);
}

export function isDelivery(value: unknown): value is Delivery {
  return typeof value === 'string' && (DELIVERIES as readonly string[]).includes(value);
}

export function ensureProject(slug: string): void {
  db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING').run(
    slug,
    slug,
    Date.now(),
  );
}

export function createFeedback(input: {
  id: string;
  project: string;
  kind: Kind;
  body: string;
  reporter: string | null;
  context: string;
  screenshotFile: string | null;
}): Feedback {
  const time = Date.now();
  ensureProject(input.project);

  db.prepare(
    `INSERT INTO feedback (id, project_id, kind, status, body, reporter, context, screenshot_path, resolution, created_at, updated_at)
     VALUES (?, ?, ?, 'open', ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    input.id,
    input.project,
    input.kind,
    input.body,
    input.reporter,
    input.context,
    input.screenshotFile,
    time,
    time,
  );

  db.prepare(
    'INSERT INTO events (feedback_id, type, from_status, to_status, note, actor, created_at) VALUES (?, ?, NULL, ?, NULL, ?, ?)',
  ).run(input.id, 'created', 'open', 'me', time);

  return getFeedback(input.id)!;
}

export function getFeedback(id: string): Feedback | null {
  const row = db.prepare(`SELECT ${SELECT} FROM feedback WHERE id = ?`).get(id) as FeedbackRow | undefined;
  return row ? rowToFeedback(row) : null;
}

export function getEvents(feedbackId: string): FeedbackEvent[] {
  return db
    .prepare(
      'SELECT id, type, from_status, to_status, note, actor, created_at FROM events WHERE feedback_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(feedbackId) as unknown as FeedbackEvent[];
}

export function getMyFeedback(ids: string[]) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT f.id, f.body, f.status, f.resolution, f.analysis, f.plan, f.fix_ref,
              f.auto, f.next_action, f.delivery, f.updated_at,
              (SELECT e.note FROM events e
               WHERE e.feedback_id = f.id AND e.note IS NOT NULL AND e.note <> ''
               ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS latest_note
       FROM feedback f
       WHERE f.id IN (${placeholders})`,
    )
    .all(...ids) as unknown as Array<{
    id: string;
    body: string;
    status: Status;
    resolution: string | null;
    analysis: string | null;
    plan: string | null;
    fix_ref: string | null;
    auto: number;
    next_action: NextAction | null;
    delivery: Delivery | null;
    latest_note: string | null;
    updated_at: number;
  }>;

  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      id: row.id,
      body: row.body,
      status: row.status,
      resolution: row.resolution,
      analysis: row.analysis,
      plan: row.plan,
      fix_ref: row.fix_ref,
      auto: row.auto === 1,
      next_action: row.next_action,
      delivery: row.delivery,
      latest_note: row.latest_note,
      updated_at: row.updated_at,
    }));
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function listFeedback(opts: {
  project?: string;
  status?: string;
  kind?: string;
  q?: string;
  nextAction?: string;
  limit: number;
  offset: number;
}): { items: Feedback[]; total: number } {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (opts.project) {
    where.push('project_id = ?');
    params.push(opts.project);
  }

  if (opts.status) {
    const statuses = opts.status.split(',').filter(isStatus);
    if (statuses.length) {
      where.push(`status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }
  }

  if (opts.kind && isKind(opts.kind)) {
    where.push('kind = ?');
    params.push(opts.kind);
  }

  if (opts.nextAction && isNextAction(opts.nextAction)) {
    where.push('next_action = ?');
    params.push(opts.nextAction);
  }

  if (opts.q) {
    const like = `%${escapeLike(opts.q)}%`;
    where.push("(body LIKE ? ESCAPE '\\' OR reporter LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM feedback ${clause}`).get(...params) as { n: number }).n;

  const rows = db
    .prepare(`SELECT ${SELECT} FROM feedback ${clause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, opts.limit, opts.offset) as unknown as FeedbackRow[];

  return { items: rows.map(rowToFeedback), total };
}

export function statusCounts(project?: string): Record<Status, number> {
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM feedback ${project ? 'WHERE project_id = ?' : ''} GROUP BY status`,
    )
    .all(...(project ? [project] : [])) as unknown as Array<{ status: Status; n: number }>;

  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>;
  for (const row of rows) counts[row.status] = row.n;
  return counts;
}

export function listProjects() {
  return db
    .prepare(
      `SELECT p.id, p.name, COUNT(f.id) AS total
       FROM projects p
       LEFT JOIN feedback f ON f.project_id = p.id
       GROUP BY p.id, p.name
       ORDER BY p.created_at ASC`,
    )
    .all() as unknown as Array<{ id: string; name: string; total: number }>;
}

export function updateFeedback(id: string, patch: FeedbackPatch, actor: string): Feedback | null {
  const current = db.prepare(`SELECT ${SELECT} FROM feedback WHERE id = ?`).get(id) as FeedbackRow | undefined;
  if (!current) return null;

  const sets: string[] = [];
  const params: Array<string | number | null> = [];
  const statusChanged = patch.status !== undefined && patch.status !== current.status;
  const note = patch.note?.trim() || null;

  const field = (column: string, value: string | null | undefined) => {
    if (value === undefined) return;
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  field('resolution', patch.resolution);
  field('analysis', patch.analysis);
  field('plan', patch.plan);
  field('assignee', patch.assignee);
  field('agent_session', patch.agent_session);
  field('fix_ref', patch.fix_ref);
  field('next_action', patch.next_action);
  field('delivery', patch.delivery);

  if (patch.auto !== undefined) {
    sets.push('auto = ?');
    params.push(patch.auto ? 1 : 0);
  }

  if (!sets.length && !note) return rowToFeedback(current);

  const time = Date.now();
  sets.push('updated_at = ?');
  params.push(time);

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE feedback SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);

    if (statusChanged) {
      db.prepare(
        'INSERT INTO events (feedback_id, type, from_status, to_status, note, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(id, 'status', current.status, patch.status!, note ?? patch.resolution ?? null, actor, time);
    } else if (note) {
      db.prepare(
        'INSERT INTO events (feedback_id, type, from_status, to_status, note, actor, created_at) VALUES (?, ?, NULL, NULL, ?, ?, ?)',
      ).run(id, 'note', note, actor, time);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getFeedback(id);
}

export function listForExport(since: number, status: string | undefined, limit: number): Feedback[] {
  const where = ['updated_at > ?'];
  const params: Array<string | number> = [since];

  if (status && isStatus(status)) {
    where.push('status = ?');
    params.push(status);
  }

  const rows = db
    .prepare(`SELECT ${SELECT} FROM feedback WHERE ${where.join(' AND ')} ORDER BY updated_at ASC, id ASC LIMIT ?`)
    .all(...params, limit) as unknown as FeedbackRow[];

  return rows.map(rowToFeedback);
}

export function listAllForCsv(): Feedback[] {
  const rows = db
    .prepare(`SELECT ${SELECT} FROM feedback ORDER BY updated_at DESC LIMIT 10000`)
    .all() as unknown as FeedbackRow[];
  return rows.map(rowToFeedback);
}
