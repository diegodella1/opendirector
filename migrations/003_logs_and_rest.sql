-- OpenDirector: Execution log, signals, undo history, templates + indexes + grants
-- Apply: sudo docker exec -i supabase-db psql -U supabase_admin -d postgres < migrations/003_logs_and_rest.sql

CREATE TABLE IF NOT EXISTS od_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES od_shows(id) ON DELETE CASCADE,
  block_id UUID,
  element_id UUID,
  timestamp TIMESTAMPTZ NOT NULL,
  seq INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  operator TEXT,
  vmix_command TEXT,
  vmix_response TEXT,
  latency_ms INTEGER,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_exec_show_time ON od_execution_log(show_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_exec_idemp ON od_execution_log(idempotency_key);

CREATE TABLE IF NOT EXISTS od_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES od_shows(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  acknowledged BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS od_undo_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  show_id UUID NOT NULL REFERENCES od_shows(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  forward_data JSONB NOT NULL,
  reverse_data JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS od_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  filename TEXT NOT NULL,
  thumbnail_path TEXT,
  is_builtin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_blocks_show ON od_blocks(show_id, position);
CREATE INDEX IF NOT EXISTS idx_elements_block ON od_elements(block_id, position);
CREATE INDEX IF NOT EXISTS idx_actions_element ON od_actions(element_id, position);
CREATE INDEX IF NOT EXISTS idx_people_show ON od_people(show_id, position);
CREATE INDEX IF NOT EXISTS idx_signals_show ON od_signals(show_id, timestamp);

-- Grant access to anon and authenticated roles (PostgREST)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
