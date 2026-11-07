import { useEffect, useState } from 'react';
import { Bot, Check, Copy, GitBranch, X } from 'lucide-react';
import { api } from './api';
import { ContextView } from './ContextView';
import { KIND_LABEL, STATUS_LABEL, STATUS_ORDER } from './labels';
import { fullTime, relativeTime } from './time';
import { useCopy } from './use-copy';
import type { Delivery, DetailData, Feedback, FeedbackEvent, Status } from './types';

const DELIVERY_LABEL: Record<Delivery, string> = {
  branch: '分支',
  merged: '已合并',
  deployed: '已上线',
};

type Patch = {
  status?: Status;
  resolution?: string | null;
  note?: string;
  delivery?: Delivery | null;
};

function statusLabel(value: string | null): string {
  if (!value) return '—';
  return (STATUS_LABEL as Record<string, string>)[value] ?? value;
}

function describeEvent(event: FeedbackEvent): string {
  if (event.type === 'created') return '提交反馈';
  if (event.type === 'status' && event.from_status && event.to_status) {
    return `${statusLabel(event.from_status)} → ${statusLabel(event.to_status)}`;
  }
  if (event.type === 'note') return '进展更新';
  return event.type;
}

function NextStep({ feedback }: { feedback: Feedback }) {
  if (feedback.status === 'open') {
    return <p className="muted">等待 manager 派发任务会话。</p>;
  }

  if (feedback.status === 'doing') {
    return <p className="muted">任务会话处理中；需要你时会直接在这个会话里问。</p>;
  }

  if (feedback.status === 'located') {
    return <p className="muted">已定位，等待你在任务会话回复。</p>;
  }

  if (feedback.status === 'needs_info') {
    return <p className="muted">需要补充信息；请在任务会话回复。</p>;
  }

  if (feedback.status === 'done') {
    return (
      <p className="muted">
        已完成。交付：{feedback.delivery ? DELIVERY_LABEL[feedback.delivery] : '未标记'}；改动：
        {feedback.fix_ref || '未记录'}。
      </p>
    );
  }

  return null;
}

export function Detail({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { copied, copy } = useCopy();

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');

    api
      .detail(id)
      .then((next) => {
        if (!alive) return;
        setData(next);
        setResolution(next.feedback.resolution ?? '');
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      });

    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const apply = async (patch: Patch) => {
    setBusy(true);
    setError('');
    try {
      const next = await api.patch(id, patch);
      setData(next);
      setResolution(next.feedback.resolution ?? '');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const feedback = data?.feedback;
  const events = data?.events ?? [];

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          {feedback ? (
            <select
              className={`status-select status-${feedback.status}`}
              value={feedback.status}
              onChange={(event) => void apply({ status: event.target.value as Status })}
              disabled={busy}
              aria-label="状态"
            >
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          ) : (
            <span className="muted">反馈详情</span>
          )}
          <span className="drawer-project">{feedback?.project ?? ''}</span>
          <button className="icon-btn drawer-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="drawer-body">
          {error && <div className="banner error">{error}</div>}

          {!feedback && !error && <p className="muted">载入中…</p>}

          {feedback && (
            <>
              <div className="meta">
                <span>{KIND_LABEL[feedback.kind]}</span>
                {feedback.auto && <span className="auto-badge">自动</span>}
                <span>{feedback.reporter || '匿名'}</span>
                <span>{fullTime(feedback.created_at)}</span>
                {feedback.updated_at !== feedback.created_at && (
                  <span>更新于 {relativeTime(feedback.updated_at)}</span>
                )}
              </div>

              <p className="feedback-body">{feedback.body}</p>

              {feedback.screenshot && (
                <a
                  className="shot"
                  href={feedback.screenshot}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="打开截图"
                >
                  <img src={feedback.screenshot} alt="提交时的页面截图" />
                  <span className="shot-hint">查看原图</span>
                </a>
              )}

              <section className="section">
                <h3>下一步</h3>
                <NextStep feedback={feedback} />
              </section>

              {feedback.agent_session && (
                <section className="section">
                  <h3>任务会话</h3>
                  <div className="agent-meta">
                    <span className="session-ref">
                      <span className="mono">{feedback.agent_session}</span>
                      <button
                        type="button"
                        className="mini-btn"
                        title="复制任务会话 id"
                        aria-label="复制任务会话 id"
                        onClick={() => copy(feedback.agent_session!)}
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copied ? '已复制' : '复制 ID'}</span>
                      </button>
                    </span>
                  </div>
                  <p className="muted session-hint">需要你拍板或补充时，直接在这个会话里回复。</p>
                </section>
              )}

              {(feedback.analysis || feedback.plan) && (
                <section className="section">
                  <h3>分析</h3>
                  {feedback.analysis && <p className="text-block">{feedback.analysis}</p>}
                  {feedback.plan && (
                    <div className="plan-block">
                      <span className="plan-label">计划</span>
                      <p className="text-block">{feedback.plan}</p>
                    </div>
                  )}
                  <div className="agent-meta">
                    {feedback.assignee && (
                      <span>
                        <Bot size={12} />
                        {feedback.assignee}
                      </span>
                    )}
                    {feedback.fix_ref && (
                      <span>
                        <GitBranch size={12} />
                        {feedback.fix_ref}
                      </span>
                    )}
                  </div>
                </section>
              )}

              <section className="section">
                <h3>解决说明</h3>
                <div className="resolution-row">
                  <input
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    placeholder="commit、原因、后续"
                    maxLength={1000}
                  />
                  <button
                    className="btn"
                    onClick={() => void apply({ resolution })}
                    disabled={busy}
                  >
                    <Check size={14} />
                    保存
                  </button>
                </div>
              </section>

              {feedback.status === 'done' && (
                <section className="section">
                  <h3>交付</h3>
                  <div className="resolution-row delivery-row">
                    <select
                      className="select"
                      value={feedback.delivery ?? ''}
                      onChange={(event) =>
                        apply({
                          delivery: (event.target.value || null) as Delivery | null,
                          note:
                            event.target.value === 'merged'
                              ? '已合并到主分支'
                              : event.target.value === 'deployed'
                                ? '已部署到现网'
                                : '交付状态已更新',
                        })
                      }
                      disabled={busy}
                      aria-label="交付状态"
                    >
                      <option value="">未标记</option>
                      <option value="branch">分支</option>
                      <option value="merged">已合并</option>
                      <option value="deployed">已上线</option>
                    </select>
                    <span className="muted delivery-hint">{feedback.fix_ref || '未记录改动'}</span>
                  </div>
                </section>
              )}

              <section className="section">
                <h3>现场</h3>
                <ContextView context={feedback.context} />
              </section>

              <section className="section">
                <div className="section-head">
                  <h3>记录</h3>
                  <button
                    className="btn ghost"
                    onClick={() => void copy(JSON.stringify({ feedback, events }, null, 2), 'json')}
                  >
                    <Copy size={14} />
                    {copied === 'json' ? '已复制' : '复制 JSON'}
                  </button>
                </div>
                <ol className="timeline">
                  {events.map((event) => (
                    <li key={event.id}>
                      <span className={`t-dot t-${event.type}`} />
                      <div className="t-body">
                        <div className="t-line">
                          {describeEvent(event)}
                          {event.type === 'status' && event.note ? ` · ${event.note}` : ''}
                        </div>
                        {event.type === 'note' && event.note && (
                          <div className="t-note-text">{event.note}</div>
                        )}
                        <div className="t-time">
                          {fullTime(event.created_at)} · {event.actor === 'dsh' ? 'DSH' : '我'}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
