import { STATUS_LABEL } from './labels';
import type { Status } from './types';

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`status status-${status}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}
