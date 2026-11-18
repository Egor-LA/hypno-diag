-- Таблицы опросника по весу. Префикс wt_, таблицы опросника состояния не затрагиваются.
CREATE TABLE IF NOT EXISTS wt_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  tg_user_id BIGINT UNIQUE,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS wt_sessions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES wt_clients(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'finished')),
  current_step TEXT,
  started_at BIGINT NOT NULL,
  finished_at BIGINT,
  scores JSONB,
  primary_theme TEXT,
  second_theme TEXT,
  notes JSONB,
  flags JSONB,
  UNIQUE (client_id, number)
);

CREATE TABLE IF NOT EXISTS wt_answers (
  session_id TEXT NOT NULL REFERENCES wt_sessions(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  value JSONB,
  text TEXT,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (session_id, question_key)
);

-- RLS без публичных политик: доступ только у серверной функции
ALTER TABLE wt_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE wt_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wt_answers ENABLE ROW LEVEL SECURITY;
