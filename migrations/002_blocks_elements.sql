-- OpenDirector: People, blocks, media, elements, actions
-- Apply: sudo docker exec -i supabase-db psql -U supabase_admin -d postgres < migrations/002_blocks_elements.sql

CREATE TABLE IF NOT EXISTS od_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  vmix_input_key TEXT,
  audio_bus TEXT DEFAULT 'A',
  auto_lower_third BOOLEAN DEFAULT TRUE,
  lower_third_line1 TEXT,
  lower_third_line2 TEXT,
  photo_path TEXT,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS od_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  estimated_duration_sec INTEGER DEFAULT 0,
  cameras JSONB DEFAULT '[]',
  script TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS od_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  duration_sec REAL,
  width INTEGER,
  height INTEGER,
  thumbnail_path TEXT,
  checksum TEXT,
  codec TEXT,
  container TEXT,
  vmix_compatible BOOLEAN DEFAULT TRUE,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS od_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES od_blocks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT,
  subtitle TEXT,
  media_id UUID REFERENCES od_media(id) ON DELETE SET NULL,
  duration_sec INTEGER,
  style TEXT DEFAULT 'standard',
  mode TEXT DEFAULT 'fullscreen',
  trigger_type TEXT DEFAULT 'manual',
  trigger_config JSONB,
  vmix_input_key TEXT,
  sync_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS od_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id UUID REFERENCES od_elements(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  step_label TEXT,
  step_color TEXT,
  step_hotkey TEXT,
  position INTEGER NOT NULL,
  vmix_function TEXT NOT NULL,
  target TEXT,
  field TEXT,
  value TEXT,
  delay_ms INTEGER DEFAULT 0
);
