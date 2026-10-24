CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT,
  chat_id BIGINT,
  tz TEXT NOT NULL DEFAULT 'Europe/Moscow',
  invite TEXT UNIQUE,
  schedule TEXT NOT NULL DEFAULT 'off',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_chat ON clients(chat_id);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  answers TEXT NOT NULL,
  concern_text TEXT,
  concern_score BIGINT,
  success_text TEXT,
  other_text TEXT,
  week_note TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sub_client ON submissions(client_id, created_at);

CREATE TABLE IF NOT EXISTS reminders (
  client_id TEXT PRIMARY KEY,
  next_at BIGINT NOT NULL,
  attempts BIGINT NOT NULL DEFAULT 0,
  next_kind TEXT NOT NULL DEFAULT 'full',
  cycle_pos BIGINT NOT NULL DEFAULT 0,
  last_sent_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_rem_next ON reminders(next_at);
