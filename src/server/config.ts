import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = process.env.ENV_FILE ?? '.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer');
}

export const config = {
  port,
  host: process.env.HOST ?? '0.0.0.0',
  dataDir: resolve(process.env.DATA_DIR ?? 'data'),
  password: need('MINI_FEEDBACK_PASSWORD'),
  secret: need('MINI_FEEDBACK_SECRET'),
  apiToken: need('API_TOKEN'),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
};

mkdirSync(resolve(config.dataDir, 'uploads'), { recursive: true });
mkdirSync(resolve(config.dataDir, 'backups'), { recursive: true });
