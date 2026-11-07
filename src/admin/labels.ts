import type { Kind, Status } from './types';

export const STATUS_LABEL: Record<Status, string> = {
  open: '待处理',
  doing: '处理中',
  located: '已定位',
  needs_info: '需补充',
  done: '已完成',
  wontfix: '不处理',
};

export const STATUS_ORDER: Status[] = ['open', 'doing', 'located', 'needs_info', 'done', 'wontfix'];

export const KIND_LABEL: Record<Kind, string> = {
  bug: '问题',
  idea: '建议',
  other: '其他',
};
