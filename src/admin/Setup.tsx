import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { useCopy } from './use-copy';
import type { ProjectRow } from './types';

function CodeBlock({
  code,
  copyKey,
  copied,
  onCopy,
}: {
  code: string;
  copyKey: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  return (
    <div className="code">
      <pre>{code}</pre>
      <button className="code-copy" onClick={() => onCopy(code, copyKey)}>
        {copied === copyKey ? <Check size={13} /> : <Copy size={13} />}
        {copied === copyKey ? '已复制' : '复制'}
      </button>
    </div>
  );
}

export function Setup({ projects }: { projects: ProjectRow[] }) {
  const [base, setBase] = useState(window.location.origin);
  const [slug, setSlug] = useState(projects[0]?.id ?? 'demo');
  const cleanSlug = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/^[^a-z0-9]+/, '')
      .slice(0, 40);
  const { copied, copy } = useCopy();

  const origin = base.replace(/\/$/, '');
  const script = `<script src="${origin}/w.js" data-project="${slug}" defer></script>`;
  const bookmarklet = `javascript:(()=>{const s=document.createElement('script');s.src='${origin}/w.js?project=${slug}';document.body.appendChild(s)})()`;
  const curl = `curl -H "Authorization: Bearer $API_TOKEN" \\\n  "${origin}/api/export?since=0"`;

  return (
    <div className="setup">
      <section>
        <h1>接入</h1>
        <p>任何 Web 项目加一行。提交时会自动带上截图、控制台、失败请求和路由。</p>
      </section>

      <section>
        <h2>项目</h2>
        <div className="setup-fields">
          <label className="field">
            <span>项目 slug</span>
            <input
              value={slug}
              onChange={(event) => setSlug(cleanSlug(event.target.value))}
              list="project-slugs"
              placeholder="demo"
            />
            <datalist id="project-slugs">
              {projects.map((project) => (
                <option key={project.id} value={project.id} />
              ))}
            </datalist>
          </label>
          <label className="field grow">
            <span>服务地址</span>
            <input value={base} onChange={(event) => setBase(event.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2>一行接入</h2>
        <p>放进布局里；公开站请确认是否希望所有访客看到反馈入口。</p>
        <CodeBlock code={script} copyKey="script" copied={copied} onCopy={copy} />
      </section>

      <section>
        <h2>不改代码</h2>
        <p>
          把「反馈」拖到浏览器的书签栏，之后在任意页面点一下书签。手机上没有书签栏：点按「反馈」复制脚本，新建书签后把脚本粘到地址栏。
        </p>
        <div className="bookmark-row">
          <button
            type="button"
            className="bookmarklet"
            draggable
            onClick={() => copy(bookmarklet, 'bookmarklet')}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/uri-list', bookmarklet);
              event.dataTransfer.setData('text/plain', bookmarklet);
              event.dataTransfer.effectAllowed = 'copy';
            }}
          >
            {copied === 'bookmarklet' ? <Check size={14} /> : null}
            {copied === 'bookmarklet' ? '已复制' : '反馈'}
          </button>
          <button className="btn" onClick={() => copy(bookmarklet, 'bookmark')}>
            {copied === 'bookmark' ? <Check size={14} /> : <Copy size={14} />}
            {copied === 'bookmark' ? '已复制' : '复制书签脚本'}
          </button>
        </div>
        <p className="hint">受 CSP 限制的页面可能拦下书签脚本，这种情况用上面的一行 script。</p>
      </section>

      <section>
        <h2>给 DSH 的出口</h2>
        <p>
          增量读取用 <code>since</code> 游标，返回完整 context 和截图的绝对路径。也可以直接读
          <code>data/mini-feedback.db</code>。
        </p>
        <CodeBlock code={curl} copyKey="curl" copied={copied} onCopy={copy} />
        <p className="hint">
          令牌在 <code>API_TOKEN</code> 环境变量里；改状态用 <code>PATCH /api/feedback/:id</code>，同一个令牌。
        </p>
      </section>

      <section>
        <h2>导出</h2>
        <p>表格软件直接打开。</p>
        <a className="btn" href="/api/export.csv">
          <Download size={14} />
          下载 CSV
        </a>
      </section>
    </div>
  );
}
