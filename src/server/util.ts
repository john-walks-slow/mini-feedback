import { randomBytes } from 'node:crypto';

export function newId(prefix = 'fb'): string {
  return `${prefix}_${randomBytes(8).toString('base64url')}`;
}

export function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}
