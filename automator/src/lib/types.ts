export interface Show {
  id: string;
  name: string;
  status: string;
  version: number;
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
  overrun_behavior: string;
  overrun_safe_input_key: string | null;
}

export interface Block {
  id: string;
  show_id: string;
  name: string;
  position: number;
  estimated_duration_sec: number;
  script: string | null;
  notes: string | null;
  status: string;
  elements: ElementWithActions[];
}

export interface Element {
  id: string;
  block_id: string;
  type: string;
  position: number;
  title: string | null;
  subtitle: string | null;
  duration_sec: number | null;
  style: string;
  mode: string;
  trigger_type: string;
  vmix_input_key: string | null;
  sync_status: string;
  status: string;
}

export interface Action {
  id: string;
  element_id: string;
  phase: string;
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

export type ElementWithActions = Element & { actions: Action[] };

export interface RundownFull {
  show: Show;
  config: ShowConfig | null;
  blocks: Block[];
}

export interface TallyState {
  program: string | null;
  preview: string | null;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: string;
  elementTitle?: string;
  vmixFunction?: string;
  result: 'ok' | 'error' | 'pending';
  message?: string;
  latencyMs?: number;
}

export interface MediaSyncState {
  id: string;
  original_name: string;
  size_bytes: number;
  status: 'pending' | 'downloading' | 'synced' | 'error';
  progress?: number;        // 0-1
  local_path?: string;
  error?: string;
}
