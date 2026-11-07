import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config';
import { db } from './db';

const BACKUP_DIR = join(config.dataDir, 'backups');
const KEEP = 14;

function backupOnce(): void {
  const date = new Date().toISOString().slice(0, 10);
  const file = join(BACKUP_DIR, `${date}.db`);
  if (existsSync(file)) return;

  const escaped = file.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);

  const files = readdirSync(BACKUP_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.db$/.test(name))
    .sort();

  for (const name of files.slice(0, Math.max(0, files.length - KEEP))) {
    unlinkSync(join(BACKUP_DIR, name));
  }
}

export function startBackupSchedule(): void {
  const run = () => {
    try {
      backupOnce();
    } catch (error) {
      console.error('backup failed', error);
    }
  };

  setTimeout(run, 60_000).unref();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
