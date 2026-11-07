export type Status = 'open' | 'doing' | 'located' | 'needs_info' | 'done' | 'wontfix';

export type NextAction = 'fix' | 'info' | 'deploy';
export type Delivery = 'branch' | 'merged' | 'deployed';

export type Kind = 'bug' | 'idea' | 'other';

export interface Feedback {
  id: string;
  project: string;
  kind: Kind;
  status: Status;
  body: string;
  reporter: string | null;
  context: Record<string, unknown> | null;
  screenshot: string | null;
  screenshot_path: string | null;
  resolution: string | null;
  analysis: string | null;
  plan: string | null;
  assignee: string | null;
  agent_session: string | null;
  fix_ref: string | null;
  auto: boolean;
  next_action: NextAction | null;
  delivery: Delivery | null;
  created_at: number;
  updated_at: number;
}

export interface FeedbackEvent {
  id: number;
  type: string;
  from_status: Status | null;
  to_status: Status | null;
  note: string | null;
  actor: string;
  created_at: number;
}

export interface ProjectRow {
  id: string;
  name: string;
  total: number;
}

export type Stats = Record<Status, number>;

export interface DetailData {
  feedback: Feedback;
  events: FeedbackEvent[];
}
