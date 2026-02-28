-- 005: Add category column to od_media for media categorization
ALTER TABLE od_media ADD COLUMN IF NOT EXISTS category TEXT;

-- Backfill existing rows based on mime_type
UPDATE od_media SET category = CASE
  WHEN mime_type LIKE 'video/%' THEN 'clip'
  WHEN mime_type LIKE 'image/%' THEN 'graphic'
  WHEN mime_type LIKE 'audio/%' THEN 'audio'
END WHERE category IS NULL;

-- Index for filtering by category within a show
CREATE INDEX IF NOT EXISTS idx_media_category ON od_media(show_id, category);
