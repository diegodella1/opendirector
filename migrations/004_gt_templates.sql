-- GT Templates: configurable graphics title templates for lower thirds and graphics
-- Each template defines a vMix input + overlay + dynamic fields (SetText targets)

CREATE TABLE IF NOT EXISTS od_gt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES od_shows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vmix_input_key TEXT NOT NULL,
  overlay_number INTEGER NOT NULL DEFAULT 2,
  fields JSONB NOT NULL DEFAULT '[]',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gt_templates_show ON od_gt_templates(show_id, position);

-- Add GT template reference to elements
ALTER TABLE od_elements
  ADD COLUMN IF NOT EXISTS gt_template_id UUID REFERENCES od_gt_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gt_field_values JSONB;

-- RLS policies
GRANT ALL ON od_gt_templates TO anon, authenticated;
