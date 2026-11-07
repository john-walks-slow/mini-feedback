CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL DEFAULT 'bug' CHECK (kind IN ('bug', 'idea', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'doing', 'located', 'needs_info', 'done', 'wontfix')
  ),
  body TEXT NOT NULL,
  reporter TEXT,
  context TEXT NOT NULL,
  screenshot_path TEXT,
  resolution TEXT,
  analysis TEXT,
  plan TEXT,
  assignee TEXT,
  agent_session TEXT,
  fix_ref TEXT,
  auto INTEGER NOT NULL DEFAULT 0 CHECK (auto IN (0, 1)),
  next_action TEXT CHECK (next_action IS NULL OR next_action IN ('fix', 'info', 'deploy')),
  delivery TEXT CHECK (delivery IS NULL OR delivery IN ('branch', 'merged', 'deployed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  actor TEXT NOT NULL DEFAULT 'me',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_updated ON feedback(updated_at);
CREATE INDEX IF NOT EXISTS idx_events_feedback ON events(feedback_id, created_at);
