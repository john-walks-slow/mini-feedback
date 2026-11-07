import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Download, LogOut, MessageSquare, Plug, Search } from 'lucide-react';
import { api, ApiError } from './api';
import { Detail } from './Detail';
import { Login } from './Login';
import { Setup } from './Setup';
import { StatusPill } from './StatusPill';
import { KIND_LABEL, STATUS_LABEL, STATUS_ORDER } from './labels';
import { relativeTime } from './time';
import type { Feedback, ProjectRow, Stats, Status } from './types';

type View = 'inbox' | 'setup';

const EMPTY_STATS: Stats = {
  open: 0,
  doing: 0,
  located: 0,
  needs_info: 0,
  done: 0,
  wontfix: 0,
};

function oneLine(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>('inbox');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [project, setProject] = useState('');
  const [status, setStatus] = useState<'' | Status>('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    api
      .session()
      .then((result) => setAuthed(result.authed))
      .catch(() => setAuthed(false));
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const result = await api.projects();
      setProjects(result.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAuthed(false);
    }
  }, []);

  useEffect(() => {
    if (authed) void loadProjects();
  }, [authed, loadProjects]);

  const loadList = useCallback(async () => {
    const ticket = ++sequence.current;
    setLoading(true);

    try {
      const result = await api.list({
        project: project || undefined,
        status: status || undefined,
        q: q.trim() || undefined,
      });
      if (ticket !== sequence.current) return;
      setItems(result.items);
      setTotal(result.total);
      setStats(result.stats);
      setError('');
    } catch (err) {
      if (ticket !== sequence.current) return;
      if (err instanceof ApiError && err.status === 401) {
        setAuthed(false);
        return;
      }
      setError((err as Error).message);
    } finally {
      if (ticket === sequence.current) setLoading(false);
    }
  }, [project, status, q]);

  useEffect(() => {
    if (!authed) return;
    const timer = window.setTimeout(() => void loadList(), q ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [authed, loadList, q]);

  const refresh = useCallback(() => {
    void loadList();
    void loadProjects();
  }, [loadList, loadProjects]);

  const closeDetail = useCallback(() => setSelected(null), []);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setAuthed(false);
    }
  };

  if (authed === null) {
    return (
      <div className="boot">
        <span className="brand-mark" />
      </div>
    );
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  const allCount = Object.values(stats).reduce((sum, count) => sum + count, 0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            <span className="brand-mark" />
            <span>mini-feedback</span>
          </div>
          <div className="topbar-actions">
            <button
              className={`btn ${view === 'setup' ? 'active' : ''}`}
              onClick={() => setView((current) => (current === 'setup' ? 'inbox' : 'setup'))}
            >
              <Plug size={15} />
              接入
            </button>
            <button className="btn ghost" onClick={() => void logout()}>
              <LogOut size={15} />
              退出
            </button>
          </div>
        </div>

        {view === 'inbox' && (
          <div className="toolbar">
            <label className="search">
              <Search size={15} />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="搜索内容或报告人"
                aria-label="搜索"
              />
            </label>

            <select
              className="select"
              value={project}
              onChange={(event) => setProject(event.target.value)}
              aria-label="项目"
            >
              <option value="">全部项目</option>
              {projects.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.id} · {entry.total}
                </option>
              ))}
            </select>

            <select
              className="select"
              value={status}
              onChange={(event) => setStatus(event.target.value as '' | Status)}
              aria-label="状态"
            >
              <option value="">全部状态 · {allCount}</option>
              {STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]} · {stats[value]}
                </option>
              ))}
            </select>

            <a className="btn ghost csv-link" href="/api/export.csv">
              <Download size={15} />
              CSV
            </a>
          </div>
        )}
      </header>

      <main className="main">
        {view === 'setup' ? (
          <Setup projects={projects} />
        ) : (
          <>
            {error && <div className="banner error">{error}</div>}
            <div className="list-meta">{loading ? '载入中…' : `${total} 条`}</div>

            {!loading && items.length === 0 ? (
              <div className="empty">
                <MessageSquare size={22} />
                <h2>还没有反馈</h2>
                <p>在开发页面加一行 script，或者从接入页拖一个书签。</p>
                <button className="btn primary" onClick={() => setView('setup')}>
                  <Plug size={14} />
                  去接入
                </button>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="col-status">状态</th>
                        <th>内容</th>
                        <th className="col-project">项目</th>
                        <th className="col-kind">类型</th>
                        <th className="col-reporter">报告人</th>
                        <th className="col-time">更新</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} onClick={() => setSelected(item.id)}>
                          <td>
                            <StatusPill status={item.status} />
                          </td>
                          <td>
                            <div className="cell-content">
                              <span className="cell-text">{oneLine(item.body)}</span>
                              {item.screenshot && (
                                <Camera size={13} className="cell-camera" aria-label="有截图" />
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="mono subtle ellipsis">{item.project}</span>
                          </td>
                          <td>{KIND_LABEL[item.kind]}</td>
                          <td className="subtle ellipsis">{item.reporter || '—'}</td>
                          <td className="subtle">{relativeTime(item.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="cards">
                  {items.map((item) => (
                    <article key={item.id} className="card" onClick={() => setSelected(item.id)}>
                      <div className="card-top">
                        <StatusPill status={item.status} />
                        <span className="card-project">{item.project}</span>
                        <span className="card-time">{relativeTime(item.updated_at)}</span>
                      </div>
                      <p className="card-body">{oneLine(item.body)}</p>
                      <div className="card-foot">
                        <span>{KIND_LABEL[item.kind]}</span>
                        <span>{item.reporter || '匿名'}</span>
                        {item.screenshot && (
                          <span className="card-shot">
                            <Camera size={12} />
                            截图
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {selected && <Detail id={selected} onClose={closeDetail} onChanged={refresh} />}
    </div>
  );
}
