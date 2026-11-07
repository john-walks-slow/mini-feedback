import { buildContext, startCapture } from './capture';
import { captureScreenshot } from './screenshot';

type Kind = 'bug' | 'idea' | 'other';
type Tab = 'compose' | 'mine';

interface Options {
  project: string;
  endpoint: string;
  position: 'left' | 'right';
  theme: 'light' | 'dark';
}

interface MineItem {
  id: string;
  body: string;
  status: string;
  resolution: string | null;
  analysis: string | null;
  plan: string | null;
  fix_ref: string | null;
  auto: boolean;
  next_action: string | null;
  delivery: string | null;
  latest_note: string | null;
  updated_at: number;
}

const IDS_KEY = 'bc_ids';
const NAME_KEY = 'bc_name';
const FAB_POS_KEY = 'bc_fab_pos';

const STATUS_LABEL: Record<string, string> = {
  open: '待处理',
  doing: '处理中',
  located: '已定位',
  needs_info: '需补充',
  done: '已完成',
  wontfix: '不处理',
};

const CLOSED_STATUSES = new Set(['done', 'wontfix']);

const CSS = `
:host { all: initial; }
.bc, .bc * { box-sizing: border-box; }
.bc {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1d1d1b;
  -webkit-font-smoothing: antialiased;
}
[hidden] { display: none !important; }
.fab {
  position: fixed; right: -32px; bottom: calc(18px + env(safe-area-inset-bottom)); z-index: 2147483000;
  display: inline-flex; align-items: center; justify-content: flex-start;
  width: 64px; height: 40px; padding: 0 0 0 7px;
  border: 0; border-radius: 999px; background: #1d1d1b; color: #fff;
  box-shadow: 0 8px 24px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.18);
  cursor: grab; pointer-events: auto;
  touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background .12s ease, box-shadow .12s ease;
}
.fab svg { width: 18px; height: 18px; flex: none; }
.fab:hover { background: #33332f; }
.bc.dark .fab { background: #f4f4f0; color: #1d1d1b; box-shadow: 0 8px 24px rgba(0,0,0,.28), 0 1px 3px rgba(0,0,0,.24); }
.bc.dark .fab:hover { background: #ffffff; }
.bc.left .fab { right: auto; left: -32px; justify-content: flex-end; padding: 0 7px 0 0; }
.bc.dragging .fab { cursor: grabbing; transition: none; box-shadow: 0 12px 32px rgba(0,0,0,.24), 0 2px 6px rgba(0,0,0,.2); }
.bc.snapping .fab { transition: left .18s ease, top .18s ease, background .12s ease, box-shadow .12s ease; }
.scrim {
  position: fixed; inset: 0; z-index: 2147483000; background: rgba(20,20,18,.28);
  pointer-events: auto;
}
.panel {
  position: fixed; right: 18px; bottom: calc(70px + env(safe-area-inset-bottom));
  z-index: 2147483001; width: 360px; max-width: calc(100vw - 24px);
  display: flex; flex-direction: column; max-height: min(640px, calc(100vh - 110px));
  background: #fff; border: 1px solid #e6e5df; border-radius: 14px; overflow: hidden;
  box-shadow: 0 24px 60px rgba(24,24,20,.22), 0 2px 8px rgba(24,24,20,.08);
  pointer-events: auto; animation: bc-in .16s ease-out;
}
.bc.left .panel { right: auto; left: 18px; }
@keyframes bc-in { from { transform: translateY(6px); opacity: 0; } }
.panel-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 0; }
.panel-title { font-size: 14px; font-weight: 600; }
.panel-close {
  margin-left: auto; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 7px; background: transparent; color: #71716b; cursor: pointer;
}
.panel-close:hover { background: #f4f4f0; color: #1d1d1b; }
.tabs { display: flex; gap: 2px; padding: 10px 14px 0; }
.tab {
  display: inline-flex; align-items: center; gap: 5px; margin-right: 14px; padding: 6px 0;
  border: 0; border-bottom: 2px solid transparent; background: transparent;
  font: inherit; font-size: 12.5px; color: #71716b; cursor: pointer;
}
.tab.active { color: #1d1d1b; border-bottom-color: #1d1d1b; }
.badge {
  min-width: 15px; height: 15px; padding: 0 4px; border-radius: 999px;
  background: #1d1d1b; color: #fff; font-size: 9.5px;
  display: inline-flex; align-items: center; justify-content: center;
}
.compose { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; min-height: 0; }
textarea {
  width: 100%; min-height: 92px; resize: none; border: 1px solid #e6e5df; border-radius: 9px;
  padding: 9px 10px; font: inherit; font-size: 13px; line-height: 1.55;
  background: #fafaf7; outline: none; color: #1d1d1b;
}
textarea:focus { border-color: #c9c8c0; background: #fff; }
.kinds { display: flex; gap: 6px; }
.kind {
  height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid #e6e5df;
  background: #fff; color: #71716b; font: inherit; font-size: 11.5px; cursor: pointer;
}
.kind.active { background: #1d1d1b; border-color: #1d1d1b; color: #fff; }
.attach { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.attach-title { font-size: 11px; color: #9b9b94; }
.attach label { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: #1d1d1b; cursor: pointer; user-select: none; }
.attach input { width: 14px; height: 14px; margin: 0; accent-color: #1d1d1b; }
.context-line { font-size: 11px; color: #9b9b94; }
.name {
  width: 100%; height: 30px; border: 1px solid #e6e5df; border-radius: 8px;
  padding: 0 9px; font: inherit; font-size: 12px; background: #fff; outline: none;
}
.name:focus { border-color: #c9c8c0; }
.form-error { margin: 0; font-size: 11.5px; color: #9a3b2e; }
.submit {
  height: 36px; border: 0; border-radius: 9px; background: #1d1d1b; color: #fff;
  font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
}
.submit:hover { background: #33332f; }
.submit:disabled { opacity: .6; cursor: default; }
.mine { padding: 12px 14px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.mine-empty { color: #9b9b94; font-size: 12.5px; padding: 18px 0; text-align: center; }
.mine-item { border: 1px solid #e6e5df; border-radius: 9px; padding: 9px 10px; }
.mine-top { display: flex; align-items: center; gap: 8px; }
.pill {
  display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px;
  border-radius: 999px; font-size: 10.5px; font-weight: 500;
}
.pill::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.pill-open { color: #9a5b05; background: #f7ecda; }
.pill-doing { color: #1f4e8c; background: #e9f0fb; }
.pill-located { color: #4a4a8a; background: #eeeef9; }
.pill-needs_info { color: #8a3b2e; background: #fbeeec; }
.pill-done { color: #2f6b46; background: #e8f3ec; }
.pill-wontfix { color: #66665f; background: #efefeb; }
.auto-tag {
  font-size: 9.5px; line-height: 1; color: #71716b; border: 1px solid #e0dfd8;
  border-radius: 999px; padding: 3px 6px;
}
.mine-note {
  margin-top: 6px; font-size: 10.5px; line-height: 1.45; color: #71716b;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: anywhere;
}
.mine-plan {
  margin-top: 4px; font-size: 10.5px; line-height: 1.45; color: #4a4a8a;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: anywhere;
}
.mine-time { margin-left: auto; font-size: 10.5px; color: #9b9b94; }
.mine-body {
  margin-top: 7px; font-size: 12.5px; line-height: 1.5; color: #1d1d1b;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: anywhere;
}
.mine-delivery { margin-top: 4px; font-size: 10.5px; color: #2f6b46; }
.mine-res { margin-top: 6px; font-size: 10.5px; color: #2f6b46; overflow-wrap: anywhere; }
.toast {
  position: fixed; left: 50%; top: calc(16px + env(safe-area-inset-top));
  transform: translateX(-50%); z-index: 2147483002;
  display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 32px);
  padding: 8px 8px 8px 14px; border-radius: 999px; background: #1d1d1b; color: #fff;
  font-size: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.2); pointer-events: auto;
}
.toast-text { overflow-wrap: anywhere; }
.toast-action {
  border: 0; background: rgba(255,255,255,.14); color: #fff; height: 24px; padding: 0 9px;
  border-radius: 999px; font: inherit; font-size: 11px; cursor: pointer; white-space: nowrap;
}
@media (max-width: 520px) {
  .panel {
    left: 0; right: 0; bottom: 0; width: 100%; max-width: none; max-height: 84vh;
    border-radius: 16px 16px 0 0; border-bottom: 0;
  }
  .bc.left .panel { left: 0; right: 0; width: 100%; max-width: none; }
  .scrim { display: block; }
  textarea,
  .name { font-size: 16px; }
  .compose,
  .mine { padding-bottom: calc(14px + env(safe-area-inset-bottom)); }
}
`;

const TEMPLATE = `
<button class="fab" type="button" aria-label="反馈" title="反馈（可拖动贴边）">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
</button>
<div class="scrim" hidden></div>
<section class="panel" hidden aria-label="反馈">
  <div class="panel-head">
    <span class="panel-title">反馈</span>
    <button class="panel-close" type="button" aria-label="关闭">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  </div>
  <div class="tabs">
    <button class="tab active" type="button" data-tab="compose">提交</button>
    <button class="tab" type="button" data-tab="mine">我的反馈 <span class="badge" hidden></span></button>
  </div>
  <form class="compose">
    <textarea maxlength="4000" placeholder="哪里不对，或者你希望怎样？" aria-label="反馈内容"></textarea>
    <div class="kinds" role="group" aria-label="类型">
      <button class="kind active" type="button" data-kind="bug">问题</button>
      <button class="kind" type="button" data-kind="idea">建议</button>
      <button class="kind" type="button" data-kind="other">其他</button>
    </div>
    <div class="attach" role="group" aria-label="附带信息">
      <span class="attach-title">附带</span>
      <label><input type="checkbox" data-attach="screenshot" checked /> 截图</label>
      <label><input type="checkbox" data-attach="console" checked /> 控制台</label>
      <label><input type="checkbox" data-attach="network" checked /> 失败请求</label>
      <label><input type="checkbox" data-attach="actions" checked /> 操作记录</label>
    </div>
    <div class="context-line"></div>
    <input class="name" maxlength="40" placeholder="你的名字（可选）" aria-label="你的名字" />
    <p class="form-error" hidden></p>
    <button class="submit" type="submit">提交</button>
  </form>
  <div class="mine" hidden></div>
</section>
<div class="toast" hidden><span class="toast-text"></span><button class="toast-action" type="button" hidden>查看进展</button></div>
`;

function readIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(IDS_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 50) : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    localStorage.setItem(IDS_KEY, JSON.stringify(ids.slice(0, 50)));
  } catch {
    // storage can be disabled; the submission still works
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function initWidget(options: Options) {
  if (document.getElementById('bc-widget-root')) return;

  const host = document.createElement('div');
  host.id = 'bc-widget-root';
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  const root = document.createElement('div');
  root.className = `bc ${options.position === 'left' ? 'left' : ''} ${options.theme === 'dark' ? 'dark' : ''}`;
  root.innerHTML = TEMPLATE;
  shadow.appendChild(root);

  const fab = root.querySelector<HTMLButtonElement>('.fab')!;
  const scrim = root.querySelector<HTMLDivElement>('.scrim')!;
  const panel = root.querySelector<HTMLElement>('.panel')!;
  const closeButton = root.querySelector<HTMLButtonElement>('.panel-close')!;
  const form = root.querySelector<HTMLFormElement>('.compose')!;
  const textarea = root.querySelector<HTMLTextAreaElement>('textarea')!;
  const nameInput = root.querySelector<HTMLInputElement>('.name')!;
  const contextLine = root.querySelector<HTMLDivElement>('.context-line')!;
  const submitButton = root.querySelector<HTMLButtonElement>('.submit')!;
  const formError = root.querySelector<HTMLParagraphElement>('.form-error')!;
  const mine = root.querySelector<HTMLDivElement>('.mine')!;
  const badge = root.querySelector<HTMLSpanElement>('.badge')!;
  const toast = root.querySelector<HTMLDivElement>('.toast')!;
  const toastText = root.querySelector<HTMLSpanElement>('.toast-text')!;
  const toastAction = root.querySelector<HTMLButtonElement>('.toast-action')!;
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.tab'));
  const kinds = Array.from(root.querySelectorAll<HTMLButtonElement>('.kind'));
  const attachInputs = Array.from(root.querySelectorAll<HTMLInputElement>('[data-attach]'));

  const endpoint = options.endpoint.replace(/\/$/, '');
  let open = false;
  let tab: Tab = 'compose';
  let kind: Kind = 'bug';
  let sending = false;
  let toastTimer = 0;

  try {
    nameInput.value = localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    nameInput.value = '';
  }

  startCapture(host, endpoint);

  function updateBadge(count: number) {
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = String(count);
    } else {
      badge.hidden = true;
    }
  }

  function setFormError(message: string) {
    formError.textContent = message;
    formError.hidden = !message;
  }

  function showToast(message: string, withAction: boolean) {
    toastText.textContent = message;
    toastAction.hidden = !withAction;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 4500);
  }

  async function fetchMine(): Promise<MineItem[]> {
    const ids = readIds();
    if (!ids.length) return [];

    const response = await fetch(`${endpoint}/api/my`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) throw new Error('读取失败');
    const data = (await response.json()) as { items?: MineItem[] };
    return Array.isArray(data.items) ? data.items : [];
  }

  function renderMineItems(items: MineItem[]) {
    mine.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'mine-empty';
      empty.textContent = '还没有提交过反馈。';
      mine.appendChild(empty);
      updateBadge(0);
      return;
    }

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'mine-item';

      const top = document.createElement('div');
      top.className = 'mine-top';

      const pill = document.createElement('span');
      pill.className = `pill pill-${item.status}`;
      pill.textContent = STATUS_LABEL[item.status] ?? item.status;

      const time = document.createElement('span');
      time.className = 'mine-time';
      time.textContent = relativeTime(item.updated_at);

      top.append(pill);
      if (item.auto) {
        const autoTag = document.createElement('span');
        autoTag.className = 'auto-tag';
        autoTag.textContent = '自动';
        top.appendChild(autoTag);
      }
      top.appendChild(time);

      const body = document.createElement('div');
      body.className = 'mine-body';
      body.textContent = item.body;

      card.append(top, body);

      if (item.latest_note) {
        const note = document.createElement('div');
        note.className = 'mine-note';
        note.textContent = `进展：${item.latest_note}`;
        card.appendChild(note);
      }

      if (item.plan && item.status !== 'done') {
        const plan = document.createElement('div');
        plan.className = 'mine-plan';
        plan.textContent = `计划：${item.plan}`;
        card.appendChild(plan);
      }

      if (item.delivery) {
        const delivery = document.createElement('div');
        delivery.className = 'mine-delivery';
        delivery.textContent =
          item.delivery === 'deployed'
            ? '交付：已上线'
            : item.delivery === 'merged'
              ? '交付：已合并'
              : '交付：分支';
        card.appendChild(delivery);
      }

      if (item.resolution) {
        const resolution = document.createElement('div');
        resolution.className = 'mine-res';
        resolution.textContent = `说明：${item.resolution}`;
        card.appendChild(resolution);
      }

      mine.appendChild(card);
    }

    updateBadge(items.filter((item) => !CLOSED_STATUSES.has(item.status)).length);
  }

  async function refreshMine() {
    mine.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'mine-empty';
    loading.textContent = '载入中…';
    mine.appendChild(loading);

    if (!readIds().length) {
      renderMineItems([]);
      return;
    }

    try {
      renderMineItems(await fetchMine());
    } catch {
      mine.innerHTML = '';
      const error = document.createElement('div');
      error.className = 'mine-empty';
      error.textContent = '读取失败，稍后再试。';
      mine.appendChild(error);
    }
  }

  function setTab(next: Tab) {
    tab = next;
    for (const button of tabs) button.classList.toggle('active', button.dataset.tab === tab);
    form.hidden = tab !== 'compose';
    mine.hidden = tab !== 'mine';
    if (tab === 'mine') void refreshMine();
  }

  function setKind(next: Kind) {
    kind = next;
    for (const button of kinds) button.classList.toggle('active', button.dataset.kind === kind);
  }

  const ATTACH_LABELS: Array<[string, string]> = [
    ['screenshot', '截图'],
    ['console', '控制台'],
    ['network', '失败请求'],
    ['actions', '操作记录'],
  ];

  function selectedAttachments(): Set<string> {
    return new Set(attachInputs.filter((input) => input.checked).map((input) => input.dataset.attach!));
  }

  function updateContextLine() {
    const attached = selectedAttachments();
    const labels = ATTACH_LABELS.filter(([key]) => attached.has(key)).map(([, label]) => label);
    contextLine.textContent = labels.length ? '页面信息始终附带' : '仅提交文字和页面信息';
  }

  for (const input of attachInputs) input.addEventListener('change', updateContextLine);

  function openPanel() {
    open = true;
    panel.hidden = false;
    scrim.hidden = false;
    fab.hidden = true;
    updateContextLine();
    setTab('compose');
    window.setTimeout(() => textarea.focus(), 30);
  }

  function closePanel() {
    open = false;
    panel.hidden = true;
    scrim.hidden = true;
    fab.hidden = false;
  }

  let suppressClick = false;
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function applyFabPosition(side: 'left' | 'right', top: number, animate: boolean) {
    const rect = fab.getBoundingClientRect();
    const margin = 12;
    const half = rect.width / 2;
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    const y = clamp(top, margin, maxY);
    const x = side === 'left' ? -half : window.innerWidth - half;

    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    fab.style.left = `${x}px`;
    fab.style.top = `${y}px`;
    root.classList.toggle('left', side === 'left');

    if (animate) {
      root.classList.add('snapping');
      window.setTimeout(() => root.classList.remove('snapping'), 220);
    }

    return y;
  }

  function saveFabPosition(side: 'left' | 'right', y: number) {
    try {
      localStorage.setItem(FAB_POS_KEY, JSON.stringify({ side, y }));
    } catch {
      // storage can be disabled; dragging still works for this page
    }
  }

  function restoreFabPosition() {
    let saved: { side?: string; y?: number } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(FAB_POS_KEY) ?? 'null') as { side?: string; y?: number } | null;
    } catch {
      saved = null;
    }

    if (!saved || (saved.side !== 'left' && saved.side !== 'right') || typeof saved.y !== 'number') return;

    requestAnimationFrame(() => {
      applyFabPosition(saved!.side as 'left' | 'right', saved!.y as number, false);
    });
  }

  fab.addEventListener('pointerdown', (event) => {
    if (open || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const rect = fab.getBoundingClientRect();
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    fab.style.left = `${rect.left}px`;
    fab.style.top = `${rect.top}px`;
    fab.setPointerCapture(event.pointerId);
    root.classList.add('dragging');
  });

  fab.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 4) moved = true;
    if (!moved) return;

    const rect = fab.getBoundingClientRect();
    const margin = 12;
    const half = rect.width / 2;
    const minX = -half;
    const maxX = window.innerWidth - half;
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    fab.style.left = `${clamp(event.clientX - offsetX, minX, maxX)}px`;
    fab.style.top = `${clamp(event.clientY - offsetY, margin, maxY)}px`;
  });

  function endDrag(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('dragging');
    try {
      fab.releasePointerCapture(event.pointerId);
    } catch {
      // pointer capture may already be gone
    }
    if (!moved) return;

    const rect = fab.getBoundingClientRect();
    const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
    const y = applyFabPosition(side, rect.top, true);
    saveFabPosition(side, y);
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 350);
  }

  fab.addEventListener('pointerup', endDrag);
  fab.addEventListener('pointercancel', endDrag);

  fab.addEventListener('click', (event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
      return;
    }
    openPanel();
  });

  window.addEventListener('resize', () => {
    if (!fab.style.left) return;
    const rect = fab.getBoundingClientRect();
    const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
    const y = applyFabPosition(side, rect.top, false);
    saveFabPosition(side, y);
  });

  restoreFabPosition();
  closeButton.addEventListener('click', closePanel);
  scrim.addEventListener('click', closePanel);

  for (const button of tabs) {
    button.addEventListener('click', () => setTab(button.dataset.tab === 'mine' ? 'mine' : 'compose'));
  }

  for (const button of kinds) {
    button.addEventListener('click', () => setKind((button.dataset.kind as Kind) ?? 'bug'));
  }

  toastAction.addEventListener('click', () => {
    toast.hidden = true;
    setTab('mine');
  });

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && open) closePanel();
    },
    true,
  );

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!open || event.composedPath().includes(host)) return;
      closePanel();
    },
    true,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;

    const body = textarea.value.trim();
    if (!body) {
      setFormError('写一句再提交');
      textarea.focus();
      return;
    }

    sending = true;
    submitButton.disabled = true;
    setFormError('');

    const attached = selectedAttachments();
    let shot: { dataUrl: string | null; error: string | null } = { dataUrl: null, error: null };

    try {
      if (attached.has('screenshot')) {
        submitButton.textContent = '正在截图…';
        shot = await captureScreenshot(
          endpoint,
          () => {
            panel.hidden = true;
            scrim.hidden = true;
            fab.hidden = true;
          },
          () => {
            if (open) {
              panel.hidden = false;
              scrim.hidden = false;
              fab.hidden = true;
            }
          },
        );
      }

      submitButton.textContent = '提交中…';

      const context = buildContext() as Record<string, unknown>;
      if (!attached.has('console')) delete context.console;
      if (!attached.has('network')) delete context.network;
      if (!attached.has('actions')) delete context.actions;
      context.capture = attached.has('screenshot')
        ? shot.dataUrl
          ? { screenshot: 'ok' }
          : { screenshot: 'failed', reason: shot.error }
        : { screenshot: 'skipped' };

      const reporter = nameInput.value.trim();
      const response = await fetch(`${endpoint}/api/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project: options.project,
          kind,
          body,
          reporter,
          context,
          image: shot.dataUrl,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || '提交失败');
      }

      const data = (await response.json()) as { id?: string };
      if (typeof data.id === 'string') {
        const ids = readIds();
        ids.unshift(data.id);
        writeIds(ids);
      }

      if (reporter) {
        try {
          localStorage.setItem(NAME_KEY, reporter);
        } catch {
          // ignore storage failures
        }
      }

      textarea.value = '';
      setTab('mine');
      showToast('收到了，谢谢。', true);
    } catch (error) {
      setFormError((error as Error).message || '提交失败');
      if (open) {
        panel.hidden = false;
        fab.hidden = true;
      }
    } finally {
      sending = false;
      submitButton.disabled = false;
      submitButton.textContent = '提交';
    }
  });

  if (readIds().length) void refreshMine();
}
