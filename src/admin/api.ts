import type { Delivery, DetailData, Feedback, NextAction, ProjectRow, Stats, Status } from './types';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, data?.error ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

function query(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const text = qs.toString();
  return text ? `?${text}` : '';
}

export const api = {
  session: () => request<{ authed: boolean; actor: string | null }>('/api/session'),

  login: (password: string) =>
    request<{ ok: true }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),

  list: (params: { project?: string; status?: string; q?: string; limit?: number; offset?: number }) =>
    request<{ items: Feedback[]; total: number; stats: Stats }>(`/api/feedback${query(params)}`),

  detail: (id: string) => request<DetailData>(`/api/feedback/${id}`),

  patch: (id: string, patch: { status?: Status; resolution?: string | null; note?: string; delivery?: Delivery | null; next_action?: NextAction | null; auto?: boolean }) =>
    request<DetailData>(`/api/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  projects: () => request<{ items: ProjectRow[] }>('/api/projects'),
};
