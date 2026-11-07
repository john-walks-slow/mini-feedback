import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
}

function safeHref(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv-row">
      <span className="kv-key">{label}</span>
      <span className="kv-value">{children}</span>
    </div>
  );
}

export function ContextView({ context }: { context: unknown }) {
  const data = record(context);
  if (!Object.keys(data).length) return <p className="muted">没有现场信息。</p>;

  const page = record(data.page);
  const viewport = record(data.viewport);
  const env = record(data.env);
  const capture = record(data.capture);
  const consoleItems = rows(data.console);
  const networkItems = rows(data.network);
  const actionItems = rows(data.actions);
  const url = safeHref(text(page.url));

  const width = Number(viewport.w);
  const height = Number(viewport.h);
  const dpr = Number(viewport.dpr);
  const viewportText =
    width && height ? `${width} × ${height}${dpr ? ` @ ${dpr}x` : ''}` : '';

  return (
    <div className="context">
      <details className="ctx" open>
        <summary>页面</summary>
        <div className="kv">
          {url && (
            <Row label="地址">
              <a className="link" href={url} target="_blank" rel="noreferrer">
                {text(page.url)}
                <ExternalLink size={12} />
              </a>
            </Row>
          )}
          <Row label="标题">{text(page.title) || '—'}</Row>
          <Row label="路由">{text(page.route) || '—'}</Row>
          <Row label="构建">{text(data.build) || '—'}</Row>
        </div>
      </details>

      <details className="ctx">
        <summary>环境</summary>
        <div className="kv">
          <Row label="视口">{viewportText || '—'}</Row>
          <Row label="语言">{text(env.lang) || '—'}</Row>
          <Row label="时区">{text(env.tz) || '—'}</Row>
          <Row label="UA">{text(env.ua) || '—'}</Row>
        </div>
      </details>

      <details className="ctx" open={consoleItems.length > 0}>
        <summary>
          控制台 <span className="count">{consoleItems.length}</span>
        </summary>
        {consoleItems.length === 0 ? (
          <p className="muted">没有 error / warn。</p>
        ) : (
          <ul className="log-list">
            {consoleItems.slice(-20).map((item, index) => (
              <li key={index} className={text(item.level) === 'warn' ? 'log-warn' : 'log-error'}>
                <span className="log-level">{text(item.level) || 'error'}</span>
                <span className="log-text">{text(item.text)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="ctx" open={networkItems.length > 0}>
        <summary>
          失败请求 <span className="count">{networkItems.length}</span>
        </summary>
        {networkItems.length === 0 ? (
          <p className="muted">没有失败请求。</p>
        ) : (
          <ul className="log-list">
            {networkItems.slice(-10).map((item, index) => {
              const status = Number(item.status);
              return (
                <li key={index} className={status >= 500 ? 'log-error' : 'log-warn'}>
                  <span className="log-method">{text(item.method) || 'GET'}</span>
                  <span className="log-text">{text(item.url)}</span>
                  <span className="log-status">{status || 'ERR'}</span>
                  <span className="log-ms">{Math.round(Number(item.ms) || 0)}ms</span>
                </li>
              );
            })}
          </ul>
        )}
      </details>

      <details className="ctx">
        <summary>
          操作 <span className="count">{actionItems.length}</span>
        </summary>
        {actionItems.length === 0 ? (
          <p className="muted">没有记录到操作。</p>
        ) : (
          <ul className="log-list">
            {actionItems.slice(-20).map((item, index) => (
              <li key={index}>
                <span className="log-method">{text(item.type) || 'action'}</span>
                <span className="log-text">{text(item.target) || '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {'screenshot' in capture && text(capture.screenshot) === 'failed' && (
        <p className="warn">截图失败{text(capture.reason) ? `：${text(capture.reason)}` : ''}，其余现场信息已保留。</p>
      )}

      <details className="ctx">
        <summary>原始 JSON</summary>
        <pre className="raw">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}
