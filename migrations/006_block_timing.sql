-- 006: Add actual_duration_sec to blocks for back-timing
ALTER TABLE od_blocks ADD COLUMN IF NOT EXISTS actual_duration_sec INTEGER DEFAULT NULL;
