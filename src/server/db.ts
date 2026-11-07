import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export const db = new DatabaseSync(join(config.dataDir, 'mini-feedback.db'));

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

function migrateFeedbackTable(): void {
  const table = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'feedback'")
    .get() as { name: string; sql: string } | undefined;
  if (!table) return;

  const columns = db.prepare('PRAGMA table_info(feedback)').all() as unknown as Array<{ name: string }>;
  const oldColumns = new Set(columns.map((column) => column.name));
  const hasFlags = ['auto', 'next_action', 'delivery'].every((name) => oldColumns.has(name));
  const hasNewStatus = table.sql.includes("'open'") && table.sql.includes("'needs_info'");
  if (hasFlags && hasNewStatus) return;

  const create = schema.match(/CREATE TABLE IF NOT EXISTS feedback \([\s\S]*?\n\);/)?.[0];
  if (!create) throw new Error('feedback table definition missing from schema.sql');

  const value = (name: string, fallback = 'NULL') => (oldColumns.has(name) ? name : fallback);
  const createNew = create.replace('CREATE TABLE IF NOT EXISTS feedback', 'CREATE TABLE feedback_new');

  const statusExpr = `
    CASE status
      WHEN 'new' THEN 'open'
      WHEN 'open' THEN 'open'
      WHEN 'analyzing' THEN 'doing'
      WHEN 'doing' THEN 'doing'
      WHEN 'fix_requested' THEN 'doing'
      WHEN 'fixing' THEN 'doing'
      WHEN 'located' THEN 'located'
      WHEN 'needs_info' THEN 'needs_info'
      WHEN 'fixed' THEN 'done'
      WHEN 'done' THEN 'done'
      WHEN 'wontfix' THEN 'wontfix'
      ELSE 'open'
    END`;
  const nextActionExpr = oldColumns.has('next_action')
    ? 'next_action'
    : `CASE status WHEN 'located' THEN 'fix' WHEN 'needs_info' THEN 'info' ELSE NULL END`;
  const deliveryExpr = oldColumns.has('delivery')
    ? 'delivery'
    : `CASE WHEN status IN ('fixed', 'done') THEN 'branch' ELSE NULL END`;

  const hasEvents = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'events'")
    .get() as { name: string } | undefined;

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN');

  try {
    db.exec('DROP TABLE IF EXISTS feedback_new;');
    db.exec(createNew);
    db.exec(`
      INSERT INTO feedback_new (
        id, project_id, kind, status, body, reporter, context, screenshot_path,
        resolution, analysis, plan, assignee, agent_session, fix_ref,
        auto, next_action, delivery, created_at, updated_at
      )
      SELECT
        id, project_id, kind,
        ${statusExpr},
        body, reporter, context, ${value('screenshot_path')}, ${value('resolution')},
        ${value('analysis')}, ${value('plan')}, ${value('assignee')}, ${value('agent_session')}, ${value('fix_ref')},
        ${value('auto', '0')}, ${nextActionExpr}, ${deliveryExpr}, created_at, updated_at
      FROM feedback;
    `);
    db.exec('DROP TABLE feedback;');
    db.exec('ALTER TABLE feedback_new RENAME TO feedback;');

    if (hasEvents) {
      db.exec(`
        UPDATE events SET
          from_status = CASE from_status
            WHEN 'new' THEN 'open'
            WHEN 'analyzing' THEN 'doing'
            WHEN 'fix_requested' THEN 'doing'
            WHEN 'fixing' THEN 'doing'
            WHEN 'fixed' THEN 'done'
            ELSE from_status
          END,
          to_status = CASE to_status
            WHEN 'new' THEN 'open'
            WHEN 'analyzing' THEN 'doing'
            WHEN 'fix_requested' THEN 'doing'
            WHEN 'fixing' THEN 'doing'
            WHEN 'fixed' THEN 'done'
            ELSE to_status
          END;
      `);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

migrateFeedbackTable();
db.exec(schema);
