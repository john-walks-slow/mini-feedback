import { initWidget } from './ui';

const script = document.currentScript as HTMLScriptElement | null;
const src = script?.src ?? '';
const params = new URL(src, location.href).searchParams;

const project = script?.dataset.project || params.get('project') || '';
const endpoint = (script?.dataset.endpoint || (src ? new URL(src, location.href).origin : location.origin)).replace(
  /\/$/,
  '',
);
const position = script?.dataset.position === 'left' ? 'left' : 'right';
const theme = script?.dataset.theme === 'dark' ? 'dark' : 'light';

if (project) {
  initWidget({ project, endpoint, position, theme });
} else {
  console.warn('[mini-feedback] missing data-project');
}
