// OpenDirector TypeScript types — matches od_* tables

export interface Show {
  id: string;
  name: string;
  status: 'draft' | 'ready' | 'rehearsal' | 'live' | 'archived';
  version: number;
  media_size_bytes: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShowConfig {
  show_id: string;
  vmix_host: string;
  vmix_port: number;
  clip_pool_a_key: string;
  clip_pool_b_key: string;
  graphic_key: string;
  graphic_overlay: number;
  lower_third_key: string;
  lower_third_overlay: number;
  action_delay_ms: number;
  overrun_behavior: 'hold_last' | 'safe_input';
  overrun_safe_input_key: string | null;
}

export interface PrompterConfig {
  show_id: string;
  font_size: number;
  font_family: string;
  line_height: number;
  color_text: string;
  color_bg: string;
  color_marks: string;
  color_past: string;
  margin_percent: number;
  guide_enabled: boolean;
  guide_position: number;
  default_scroll_speed: number;
}

export interface Block {
  id: string;
  show_id: string;
  name: string;
  position: number;
  estimated_duration_sec: number;
  cameras: string[];
  script: string | null;
  notes: string | null;
  status: 'pending' | 'on_air' | 'done' | 'skipped';
  actual_duration_sec: number | null;
}

export interface Element {
  id: string;
  block_id: string;
  type: 'clip' | 'graphic' | 'lower_third' | 'audio' | 'note';
  position: number;
  title: string | null;
  subtitle: string | null;
  media_id: string | null;
  duration_sec: number | null;
  style: 'standard' | 'breaking' | 'data' | 'highlight';
  mode: 'fullscreen' | 'overlay' | 'pip';
  trigger_type: 'manual' | 'on_cue' | 'on_block_start' | 'timecode' | 'on_keyword';
  trigger_config: Record<string, unknown> | null;
  vmix_input_key: string | null;
  gt_template_id: string | null;
  gt_field_values: Record<string, string> | null;
  sync_status: 'pending' | 'downloading' | 'synced' | 'error';
  status: 'pending' | 'ready' | 'triggered' | 'done';
}

export interface Action {
  id: string;
  element_id: string;
  phase: 'on_cue' | 'step' | 'timecode' | 'on_exit';
  step_label: string | null;
  step_color: string | null;
  step_hotkey: string | null;
  position: number;
  vmix_function: string;
  target: string | null;
  field: string | null;
  value: string | null;
  delay_ms: number;
}

export interface Person {
  id: string;
  show_id: string;
  name: string;
  role: string | null;
  vmix_input_key: string | null;
  audio_bus: string;
  auto_lower_third: boolean;
  lower_third_line1: string | null;
  lower_third_line2: string | null;
  photo_path: string | null;
  position: number;
}

export interface WSMessage {
  channel: 'rundown' | 'execution' | 'prompter' | 'tally' | 'signals';
  seq: number;
  idempotencyKey?: string;
  timestamp: string;
  type: string;
  payload: unknown;
}

// Full rundown (show + blocks + elements + actions) for a single fetch
export interface Rundown {
  show: Show;
  blocks: (Block & { elements: (Element & { actions: Action[] })[] })[];
  gt_templates: GtTemplate[];
}

// Full rundown with config and actions (for Automator)
export interface RundownFull {
  show: Show;
  config: ShowConfig | null;
  blocks: (Block & { elements: (Element & { actions: Action[] })[] })[];
  gt_templates: GtTemplate[];
}

// Execution log entry
export interface ExecutionLogEntry {
  id?: string;
  show_id: string;
  block_id?: string;
  element_id?: string;
  timestamp: string;
  seq: number;
  idempotency_key: string;
  type: string;
  source: string;
  operator?: string;
  vmix_command?: string;
  vmix_response?: string;
  latency_ms?: number;
  metadata?: Record<string, unknown>;
}

// Tally state from vMix
export interface TallyState {
  program: string | null;
  preview: string | null;
  overlays?: Record<number, { active: boolean; input?: string }>;
  recording?: boolean;
  streaming?: boolean;
}

// Signal sent to talent via prompter
export interface Signal {
  id: string;
  show_id: string;
  type: 'countdown' | 'wrap' | 'stretch' | 'standby' | 'go' | 'custom';
  value: string | null;
  expires_at: string | null;
  acknowledged: boolean;
  created_at: string;
}

// Template metadata (stored in od_templates)
export interface Template {
  id: string;
  name: string;
  description: string | null;
  filename: string;
  is_builtin: boolean;
  created_at: string;
}

// Template JSON snapshot format
export interface TemplateSnapshot {
  version: number;
  name: string;
  config: Partial<ShowConfig>;
  blocks: {
    name: string;
    position: number;
    estimated_duration_sec: number;
    script: string | null;
    elements: {
      type: string;
      position: number;
      title: string | null;
      subtitle: string | null;
      duration_sec: number | null;
      style: string;
      mode: string;
      trigger_type: string;
      actions: {
        phase: string;
        step_label: string | null;
        position: number;
        vmix_function: string;
        target: string | null;
        field: string | null;
        value: string | null;
        delay_ms: number;
      }[];
    }[];
  }[];
  people: { name: string; role: string | null }[];
}

// GT Template field definition
export interface GtTemplateField {
  name: string;    // vMix field name, e.g. "Headline.Text"
  label: string;   // UI label, e.g. "Nombre"
  default?: string;
}

// GT Template (stored in od_gt_templates)
export interface GtTemplate {
  id: string;
  show_id: string;
  name: string;
  vmix_input_key: string;
  overlay_number: number;
  fields: GtTemplateField[];
  position: number;
  created_at: string;
}

// Media file metadata (stored in od_media)
export interface MediaFile {
  id: string;
  show_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  codec: string | null;
  container: string | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  fps: number | null;
  thumbnail_path: string | null;
  checksum: string | null;
  category: 'clip' | 'stinger' | 'graphic' | 'lower_third' | 'audio' | null;
  vmix_compatible: boolean;
  created_at: string;
}

// Undo history entry (stored in od_undo_history)
export interface UndoEntry {
  id: string;
  show_id: string;
  action_type: string;
  forward_data: Record<string, unknown>;
  reverse_data: Record<string, unknown>;
  created_at: string;
}

// Live state for Go Live panel
export interface LiveState {
  currentBlockId: string | null;
  currentBlockStartedAt: string | null;
  showStartedAt: string | null;
  signals: Signal[];
  executionLog: ExecutionLogEntry[];
  tally: TallyState;
}

export type ShowStatus = Show['status'];
