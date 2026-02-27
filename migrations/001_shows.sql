-- OpenDirector: Shows, config, access, sessions, prompter config
-- Apply: sudo docker exec -i supabase-db psql -U supabase_admin -d postgres < migrations/001_shows.sql

CREATE TABLE IF NOT EXISTS od_shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  media_size_bytes BIGINT DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS od_show_config (
  show_id UUID PRIMARY KEY REFERENCES od_shows(id) ON DELETE CASCADE,
  vmix_host TEXT DEFAULT '127.0.0.1',
  vmix_port INTEGER DEFAULT 8099,
  clip_pool_a_key TEXT DEFAULT 'CLIP_A',
  clip_pool_b_key TEXT DEFAULT 'CLIP_B',
  graphic_key TEXT DEFAULT 'GFX',
  graphic_overlay INTEGER DEFAULT 1,
  lower_third_key TEXT DEFAULT 'LT',
  lower_third_overlay INTEGER DEFAULT 2,
  action_delay_ms INTEGER DEFAULT 40,
  overrun_behavior TEXT DEFAULT 'hold_last',
  overrun_safe_input_key TEXT
);

CREATE TABLE IF NOT EXISTS od_show_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS od_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  client_type TEXT NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS od_prompter_config (
  show_id UUID PRIMARY KEY REFERENCES od_shows(id) ON DELETE CASCADE,
  font_size INTEGER DEFAULT 48,
  font_family TEXT DEFAULT 'Arial',
  line_height REAL DEFAULT 1.5,
  color_text TEXT DEFAULT '#FFFFFF',
  color_bg TEXT DEFAULT '#000000',
  color_marks TEXT DEFAULT '#FFFF00',
  color_past TEXT DEFAULT 'rgba(255,255,255,0.3)',
  margin_percent INTEGER DEFAULT 15,
  guide_enabled BOOLEAN DEFAULT TRUE,
  guide_position REAL DEFAULT 0.33,
  default_scroll_speed INTEGER DEFAULT 60
);
