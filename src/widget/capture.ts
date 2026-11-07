export interface ConsoleEntry {
  level: 'error' | 'warn';
  text: string;
  t: number;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  ms: number;
}

export interface ActionEntry {
  type: string;
  target: string;
  t: number;
}

const consoleBuffer: ConsoleEntry[] = [];
const networkBuffer: NetworkEntry[] = [];
const actionBuffer: ActionEntry[] = [];

let installed = false;
let selfOrigin = '';

function pushCapped<T>(buffer: T[], entry: T, cap: number) {
  buffer.push(entry);
  if (buffer.length > cap) buffer.splice(0, buffer.length - cap);
}

function format(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function pushConsole(level: ConsoleEntry['level'], parts: unknown[]) {
  pushCapped(
    consoleBuffer,
    { level, text: parts.map(format).join(' ').slice(0, 800), t: Date.now() },
    30,
  );
}

function selfRequest(url: string): boolean {
  try {
    const resolved = new URL(url, location.href);
    return (
      resolved.origin === selfOrigin &&
      (resolved.pathname === '/api/feedback' ||
        resolved.pathname === '/api/my' ||
        resolved.pathname === '/w.js')
    );
  } catch {
    return false;
  }
}

function cleanUrl(url: string): string {
  try {
    const resolved = new URL(url, location.href);
    const text = resolved.origin === location.origin ? resolved.pathname + resolved.search : resolved.href;
    return text.slice(0, 300);
  } catch {
    return url.slice(0, 300);
  }
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function selectorOf(element: Element): string {
  if (element.id) return `#${cssEscape(element.id)}`;

  const testId = element.getAttribute('data-testid');
  if (testId) return `[data-testid="${testId.replace(/"/g, '\\"')}"]`;

  const parts: string[] = [];
  let node: Element | null = element;

  while (node && node !== document.body && parts.length < 4) {
    let part = node.tagName.toLowerCase();
    const classes = Array.from(node.classList).slice(0, 2).map(cssEscape).join('.');
    if (classes) part += `.${classes}`;
    parts.unshift(part);
    node = node.parentElement;
  }

  return parts.join(' > ') || element.tagName.toLowerCase();
}

function pushAction(type: string, target: string) {
  pushCapped(actionBuffer, { type, target: target.slice(0, 200), t: Date.now() }, 40);
}

function patchConsole() {
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    pushConsole('error', args);
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    pushConsole('warn', args);
    originalWarn(...args);
  };

  window.addEventListener('error', (event) => {
    pushConsole('error', [`${event.message} @ ${event.filename}:${event.lineno}`]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    pushConsole('error', [`unhandledrejection: ${format(event.reason)}`]);
  });
}

function patchNetwork() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

    return originalFetch(input, init).then(
      (response) => {
        if (!response.ok && !selfRequest(url)) {
          pushCapped(
            networkBuffer,
            {
              method,
              url: cleanUrl(url),
              status: response.status,
              ms: Math.round(performance.now() - started),
            },
            20,
          );
        }
        return response;
      },
      (error) => {
        if (!selfRequest(url)) {
          pushCapped(
            networkBuffer,
            { method, url: cleanUrl(url), status: 0, ms: Math.round(performance.now() - started) },
            20,
          );
        }
        throw error;
      },
    );
  };

  const xhr = XMLHttpRequest.prototype as unknown as {
    open: (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) => void;
    send: (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) => void;
  };
  const originalOpen = xhr.open;
  const originalSend = xhr.send;
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string; started: number }>();

  xhr.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    meta.set(this, { method: method.toUpperCase(), url: String(url), started: 0 });
    return originalOpen.call(this, method, url, ...rest);
  };

  xhr.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const entry = meta.get(this);
    if (entry) entry.started = performance.now();

    this.addEventListener('loadend', () => {
      if (!entry || selfRequest(entry.url)) return;
      if (this.status >= 400 || this.status === 0) {
        pushCapped(
          networkBuffer,
          {
            method: entry.method,
            url: cleanUrl(entry.url),
            status: this.status,
            ms: Math.round(performance.now() - entry.started),
          },
          20,
        );
      }
    });

    return originalSend.call(this, body);
  };
}

function patchRoutes() {
  const push = history.pushState;
  const replace = history.replaceState;

  history.pushState = function (...args: Parameters<History['pushState']>) {
    const result = push.apply(this, args);
    pushAction('route', location.pathname + location.search);
    return result;
  };
  history.replaceState = function (...args: Parameters<History['replaceState']>) {
    const result = replace.apply(this, args);
    pushAction('route', location.pathname + location.search);
    return result;
  };

  window.addEventListener('popstate', () => pushAction('route', location.pathname + location.search));
  window.addEventListener('hashchange', () => pushAction('route', location.pathname + location.search));
}

export function startCapture(host: HTMLElement, endpoint: string) {
  if (installed) return;
  installed = true;
  selfOrigin = endpoint;

  patchConsole();
  patchNetwork();
  patchRoutes();

  document.addEventListener(
    'click',
    (event) => {
      if (event.composedPath().includes(host)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      pushAction('click', selectorOf(target));
    },
    true,
  );
}

export function buildContext() {
  const meta = document.querySelector('meta[name="build-id"]')?.getAttribute('content') ?? '';
  const globalBuild = (window as Window & { __BUILD_ID__?: string }).__BUILD_ID__ ?? '';

  return {
    page: {
      url: location.href,
      title: document.title,
      referrer: document.referrer,
      route: location.pathname + location.search + location.hash,
    },
    build: String(meta || globalBuild || ''),
    viewport: {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
      screenW: window.screen.width,
      screenH: window.screen.height,
    },
    env: {
      ua: navigator.userAgent,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platform: navigator.platform,
    },
    console: consoleBuffer.slice(-20),
    network: networkBuffer.slice(-10),
    actions: actionBuffer.slice(-20),
  };
}

export function captureSummary(): string {
  const parts = ['截图'];
  if (consoleBuffer.length) parts.push(`控制台 ${consoleBuffer.length} 条`);
  if (networkBuffer.length) parts.push(`失败请求 ${networkBuffer.length} 条`);
  parts.push('页面信息');
  return `将附带${parts.join('、')}`;
}

