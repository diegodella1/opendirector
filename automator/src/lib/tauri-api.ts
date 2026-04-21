// Tauri API wrapper with mock fallback for browser development
// When running in Tauri, uses invoke(). In browser, uses direct fetch/mock.

const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let tauriListen: ((event: string, handler: (e: { payload: unknown }) => void) => Promise<() => void>) | null = null;

type VmixAction = {
  id?: string;
  phase?: string;
  step_label?: string | null;
  vmix_function: string;
  vmix_input?: string | null;
  vmix_params?: Record<string, string> | null;
  delay_ms?: number;
};

type ActionResult = {
  ok: boolean;
  latency_ms?: number;
  latencyMs?: number;
};

type ExecutionSummary = {
  ok: boolean;
  latencyMs: number;
};

function summarizeActionResults(raw: unknown): ExecutionSummary {
  if (!Array.isArray(raw)) {
    const result = raw as Partial<ExecutionSummary> | null;
    return {
      ok: Boolean(result?.ok),
      latencyMs: typeof result?.latencyMs === 'number' ? result.latencyMs : 0,
    };
  }

  const results = raw as ActionResult[];
  return {
    ok: results.length > 0 && results.every((result) => result.ok),
    latencyMs: results.reduce((total, result) => {
      const latency = result.latencyMs ?? result.latency_ms ?? 0;
      return total + latency;
    }, 0),
  };
}

// Lazy load Tauri APIs
async function getInvoke() {
  if (tauriInvoke) return tauriInvoke;
  if (IS_TAURI) {
    const { invoke } = await import('@tauri-apps/api/core');
    tauriInvoke = invoke;
    return invoke;
  }
  return null;
}

async function getListen() {
  if (tauriListen) return tauriListen;
  if (IS_TAURI) {
    const { listen } = await import('@tauri-apps/api/event');
    tauriListen = listen;
    return listen;
  }
  return null;
}

// Server URL for browser mode
let _serverUrl = 'http://192.168.1.14:3000';

export function setServerUrl(url: string) {
  _serverUrl = url;
}

export function getServerUrl() {
  return _serverUrl;
}

// Set active show for multi-tab support
export async function setActiveShow(showId: string): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke('set_active_show', { showId });
    return;
  }
  console.log(`[MOCK] set_active_show: ${showId}`);
}

// Connect to vMix TCP (Tauri only, mock in browser)
export async function connectVmix(host: string, port: number): Promise<boolean> {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke('connect_vmix', { host, port });
    return true;
  }
  console.log(`[MOCK] vMix connect to ${host}:${port}`);
  return true;
}

export async function disconnectVmix(): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke('disconnect_vmix');
    return;
  }
  console.log('[MOCK] vMix disconnected');
}

// Fetch rundown via HTTP (works in both modes)
export async function fetchRundown(serverUrl: string, showId: string) {
  const res = await fetch(`${serverUrl}/api/shows/${showId}/rundown`);
  if (!res.ok) throw new Error(`Failed to fetch rundown: ${res.status}`);
  return res.json();
}

// Fetch shows list
export async function fetchShows(serverUrl: string) {
  const res = await fetch(`${serverUrl}/api/shows`);
  if (!res.ok) throw new Error(`Failed to fetch shows: ${res.status}`);
  return res.json();
}

// WebSocket connection (works in both modes)
export function connectWebSocket(serverUrl: string, showId: string) {
  const wsUrl = serverUrl.replace('http', 'ws') + '/ws';
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', payload: { showId } }));
  };

  return ws;
}

// Execute CUE against vMix (Tauri: via Rust, browser: mock)
// Actions use Rust engine format: vmix_input + vmix_params (not target/field/value)
export async function executeCue(
  elementId: string,
  actions: VmixAction[],
  config?: {
    clip_pool_a_key?: string | null;
    clip_pool_b_key?: string | null;
    gfx_pool_key?: string | null;
    dsk_key?: string | null;
    stinger_index?: number | null;
  } | null
): Promise<{ ok: boolean; latencyMs: number }> {
  const invoke = await getInvoke();
  if (invoke) {
    const results = await invoke('execute_cue', {
      args: {
        element_id: elementId,
        actions,
        config: config || {},
      },
    });
    return summarizeActionResults(results);
  }
  // Mock: simulate execution
  console.log(`[MOCK] CUE element ${elementId}:`, actions.map(a => a.vmix_function).join(' → '));
  return { ok: true, latencyMs: 3 };
}

export async function executeStep(
  elementId: string,
  stepLabel: string,
  actions: VmixAction[],
  config?: {
    clip_pool_a_key?: string | null;
    clip_pool_b_key?: string | null;
    gfx_pool_key?: string | null;
    dsk_key?: string | null;
    stinger_index?: number | null;
  } | null
): Promise<{ ok: boolean; latencyMs: number }> {
  const invoke = await getInvoke();
  if (invoke) {
    const results = await invoke('execute_step', {
      args: {
        element_id: elementId,
        step_label: stepLabel,
        actions,
        config: config || {},
      },
    });
    return summarizeActionResults(results);
  }
  console.log(`[MOCK] STEP ${stepLabel} for element ${elementId}:`, actions.map(a => a.vmix_function).join(' → '));
  return { ok: true, latencyMs: 3 };
}

// Send raw vMix command (Tauri only)
export async function sendVmixCommand(
  func: string,
  params: string
): Promise<{ ok: boolean; response: string }> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke('send_vmix_command', { args: { function: func, params } }) as Promise<{ ok: boolean; response: string }>;
  }
  console.log(`[MOCK] vMix: FUNCTION ${func}`, params);
  return { ok: true, response: `FUNCTION OK ${func}` };
}

// Listen for Tauri events (noop in browser mode)
export async function listenEvent(
  event: string,
  handler: (payload: unknown) => void
): Promise<() => void> {
  const listen = await getListen();
  if (listen) {
    return listen(event, (e) => handler(e.payload));
  }
  return () => {};
}

// Media sync commands
export async function syncMedia(): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke('sync_media');
    return;
  }
  console.log('[MOCK] sync_media');
}

export async function getMediaSyncStatus(): Promise<unknown[]> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke('get_media_sync_status') as Promise<unknown[]>;
  }
  console.log('[MOCK] get_media_sync_status');
  return [];
}

// Load cached rundown from SQLite (offline fallback)
export async function loadCachedRundown(showId?: string): Promise<unknown> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke('load_cached_rundown', { showId: showId ?? null });
  }
  console.log('[MOCK] load_cached_rundown');
  return null;
}

export async function setMediaFolder(folder: string): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke('set_media_folder', { folder });
    return;
  }
  console.log(`[MOCK] set_media_folder: ${folder}`);
}

// Pre-flight check types and API
export interface PreflightCheck {
  key: string;
  description: string;
  level: 'ok' | 'warning' | 'error';
  suggestion: string;
}

export async function runPreflightCheck(args: {
  config: {
    clip_pool_a_key: string | null;
    clip_pool_b_key: string | null;
    graphic_key: string | null;
    lower_third_key: string | null;
  } | null;
  gt_templates: Array<{ name: string; vmix_input_key: string; fields: string[] }>;
  element_input_keys: string[];
}): Promise<PreflightCheck[]> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke('run_preflight_check', { args }) as Promise<PreflightCheck[]>;
  }
  console.log('[MOCK] run_preflight_check:', args);
  return [{ key: 'mock', description: 'Mock check', level: 'ok', suggestion: '' }];
}

// Timecode trigger commands
export async function registerTimecodeTriggers(
  triggers: Array<{
    element_id: string;
    trigger_config: string;
    clip_duration_ms: number;
  }>
): Promise<number> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke('register_timecode_triggers', { triggers }) as Promise<number>;
  }
  console.log(`[MOCK] register_timecode_triggers:`, triggers);
  return triggers.length;
}

export async function clearTimecodeTriggers(): Promise<void> {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke('clear_timecode_triggers');
    return;
  }
  console.log('[MOCK] clear_timecode_triggers');
}

export async function checkTimecodeTriggers(
  positionMs: number,
  durationMs: number
): Promise<string[]> {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke('check_timecode_triggers', {
      position_ms: positionMs,
      duration_ms: durationMs,
    }) as Promise<string[]>;
  }
  return [];
}
