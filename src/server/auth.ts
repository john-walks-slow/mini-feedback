import { createHash, timingSafeEqual } from 'node:crypto';
import { createHmac } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { config } from './config';

export const SESSION_COOKIE = 'bc_session';
export const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

function sign(value: string): string {
  return createHmac('sha256', config.secret).update(value).digest('base64url');
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function issueSession(): string {
  const exp = String(Date.now() + SESSION_TTL);
  return `${exp}.${sign(exp)}`;
}

export function verifySession(value: string | undefined): boolean {
  if (!value) return false;
  const [exp, signature] = value.split('.');
  if (!exp || !signature || Number(exp) < Date.now()) return false;
  return safeEqual(signature, sign(exp));
}

export function isBearer(c: Context): boolean {
  const header = c.req.header('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  return safeEqual(header.slice(7), config.apiToken);
}

export function isHttps(c: Context): boolean {
  return c.req.header('x-forwarded-proto') === 'https' || c.req.url.startsWith('https:');
}

export function sameOrigin(c: Context): boolean {
  if (isBearer(c)) return true;
  const origin = c.req.header('origin');
  if (!origin) return true;
  try {
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function actorOf(c: Context): string {
  return isBearer(c) ? 'dsh' : 'me';
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  if (isBearer(c)) return next();
  if (verifySession(getCookie(c, SESSION_COOKIE))) return next();
  return c.json({ error: 'unauthorized' }, 401);
};
