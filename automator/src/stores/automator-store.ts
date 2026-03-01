import { create } from 'zustand';
import type { Show, ShowConfig, Block, LogEntry, TallyState, Action, MediaSyncState, GtTemplate, ClipPosition } from '@/lib/types';
import { fetchRundown, fetchShows, connectWebSocket, executeCue, connectVmix, syncMedia, getMediaSyncStatus, setMediaFolder as setMediaFolderApi, loadCachedRundown, listenEvent, registerTimecodeTriggers, clearTimecodeTriggers, checkTimecodeTriggers, runPreflightCheck } from '@/lib/tauri-api';
import type { PreflightCheck } from '@/lib/tauri-api';
import type { BlockTiming } from '@/lib/timing';

interface AutomatorState {
  // Connection
  serverUrl: string;
  vmixHost: string;
  vmixPort: number;
  vmixConnected: boolean;
  serverConnected: boolean;
  wsConnected: boolean;

  // Data
  shows: Show[];
  show: Show | null;
  config: ShowConfig | null;
  blocks: Block[];
  gtTemplates: GtTemplate[];

  // Execution
  executionMode: 'auto' | 'manual';
  requestedElementId: string | null;
  processedKeys: Set<string>;
  currentBlockIdx: number;
  selectedElementId: string | null;
  executionLog: LogEntry[];

  // Timing
  showStartedAt: string | null;
  blockStartedAt: string | null;
  blockTimings: Record<string, BlockTiming>;

  // Clip Pool alternation
  currentClipPool: 'a' | 'b';

  // Tally
  tally: TallyState;

  // Clip position (from vMix ACTS)
  clipPosition: ClipPosition | null;

  // Preflight
  preflightResults: PreflightCheck[] | null;
  preflightLoading: boolean;
  preflightError: string | null;

  // WS ref
  ws: WebSocket | null;

  // Media sync
  mediaFolder: string;
  mediaSyncStatus: MediaSyncState[];
  setMediaFolder: (folder: string) => void;
  triggerMediaSync: () => Promise<void>;
  updateMediaProgress: (id: string, progress: number) => void;
  markMediaSynced: (id: string, localPath: string) => void;
  markMediaError: (id: string, error: string) => void;
  setMediaSyncStatus: (status: MediaSyncState[]) => void;

  // Actions
  setServerUrl: (url: string) => void;
  setVmixHost: (host: string) => void;
  setVmixPort: (port: number) => void;
  loadShows: () => Promise<void>;
  connectToShow: (showId: string) => Promise<void>;
  connectToVmix: () => Promise<void>;
  disconnect: () => void;
  setExecutionMode: (mode: 'auto' | 'manual') => void;
  clearRequestedElement: () => void;
  selectElement: (elementId: string | null) => void;
  nextBlock: (opts?: { fromRemote?: boolean }) => void;
  prevBlock: (opts?: { fromRemote?: boolean }) => void;
  cueElement: (elementId: string) => Promise<void>;
  executeStep: (elementId: string, stepLabel: string) => Promise<void>;
  registerTriggersForCurrentBlock: () => Promise<void>;
  runPreflight: () => Promise<void>;
  stopShow: () => Promise<void>;
  resetShow: () => Promise<void>;
  toggleRehearsal: () => Promise<void>;
  panicCut: () => Promise<void>;
  addLog: (entry: LogEntry) => void;
  handleWsMessage: (msg: Record<string, unknown>) => void;
}

let seqCounter = 0;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let actsUnlisten: (() => void) | null = null;

export const useAutomatorStore = create<AutomatorState>((set, get) => ({
  serverUrl: 'http://100.92.92.27:3000',
  vmixHost: '127.0.0.1',
  vmixPort: 8099,
  vmixConnected: false,
  serverConnected: false,
  wsConnected: false,
  shows: [],
  show: null,
  config: null,
  blocks: [],
  gtTemplates: [],
  executionMode: 'manual',
  requestedElementId: null,
  processedKeys: new Set(),
  currentBlockIdx: 0,
  selectedElementId: null,
  executionLog: [],
  showStartedAt: null,
  blockStartedAt: null,
  blockTimings: {},
  currentClipPool: 'a',
  tally: { program: null, preview: null },
  clipPosition: null,
  preflightResults: null,
  preflightLoading: false,
  preflightError: null,
  ws: null,
  mediaFolder: 'C:\\OpenDirector\\Media',
  mediaSyncStatus: [],

  setMediaFolder: (folder) => {
    set({ mediaFolder: folder });
    setMediaFolderApi(folder).catch(() => {});
  },

  triggerMediaSync: async () => {
    try {
      await syncMedia();
      // Fetch status after sync starts
      const status = await getMediaSyncStatus() as MediaSyncState[];
      set({ mediaSyncStatus: status });
    } catch (e) {
      console.error('Failed to trigger media sync:', e);
    }
  },

  updateMediaProgress: (id, progress) => {
    set((s) => ({
      mediaSyncStatus: s.mediaSyncStatus.map((m) =>
        m.id === id ? { ...m, status: 'downloading' as const, progress } : m
      ),
    }));
  },

  markMediaSynced: (id, localPath) => {
    set((s) => ({
      mediaSyncStatus: s.mediaSyncStatus.map((m) =>
        m.id === id ? { ...m, status: 'synced' as const, progress: 1, local_path: localPath } : m
      ),
    }));
  },

  markMediaError: (id, error) => {
    set((s) => ({
      mediaSyncStatus: s.mediaSyncStatus.map((m) =>
        m.id === id ? { ...m, status: 'error' as const, error } : m
      ),
    }));
  },

  setMediaSyncStatus: (status) => set({ mediaSyncStatus: status }),

  setExecutionMode: (mode) => {
    set({ executionMode: mode });
    const { ws } = get();
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        channel: 'execution',
        type: 'automator_mode',
        timestamp: new Date().toISOString(),
        payload: { mode, source: 'automator' },
      }));
    }
  },

  clearRequestedElement: () => set({ requestedElementId: null }),

  setServerUrl: (url) => set({ serverUrl: url }),
  setVmixHost: (host) => set({ vmixHost: host }),
  setVmixPort: (port) => set({ vmixPort: port }),

  loadShows: async () => {
    try {
      const shows = await fetchShows(get().serverUrl);
      set({ shows });
    } catch (e) {
      console.error('Failed to load shows:', e);
    }
  },

  connectToShow: async (showId) => {
    const { serverUrl } = get();
    try {
      const data = await fetchRundown(serverUrl, showId);
      set({
        show: data.show,
        config: data.config,
        blocks: data.blocks,
        gtTemplates: data.gt_templates || [],
        serverConnected: true,
        currentBlockIdx: 0,
        selectedElementId: null,
        executionLog: [],
        showStartedAt: null,
        blockStartedAt: null,
        blockTimings: {},
      });

      // Connect WebSocket
      const ws = connectWebSocket(serverUrl, showId);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          get().handleWsMessage(msg);
        } catch { /* ignore */ }
      };
      ws.onclose = () => set({ wsConnected: false });
      ws.onopen = () => {
        set({ wsConnected: true });
        // Announce automator presence
        const statusMsg = JSON.stringify({
          channel: 'execution',
          type: 'automator_status',
          timestamp: new Date().toISOString(),
          payload: { connected: true, mode: get().executionMode, source: 'automator' },
        });
        ws.send(statusMsg);
        // Start heartbeat every 5s
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              channel: 'execution',
              type: 'automator_heartbeat',
              timestamp: new Date().toISOString(),
              payload: { mode: get().executionMode, source: 'automator' },
            }));
          }
        }, 5000);
      };
      set({ ws });

      // Auto-trigger media sync
      get().triggerMediaSync();

      // Register timecode triggers for initial block
      get().registerTriggersForCurrentBlock();
    } catch (e) {
      console.error('Failed to connect to show:', e);
      // Offline fallback: try loading from SQLite cache
      try {
        const cached = await loadCachedRundown(showId) as { show: Show; config: ShowConfig | null; blocks: Block[]; gt_templates: GtTemplate[]; _cached?: boolean } | null;
        if (cached && cached.show) {
          set({
            show: cached.show,
            config: cached.config,
            blocks: cached.blocks,
            gtTemplates: cached.gt_templates || [],
            serverConnected: false, // Mark as offline
            currentBlockIdx: 0,
            selectedElementId: null,
            executionLog: [],
            showStartedAt: null,
            blockStartedAt: null,
            blockTimings: {},
          });
          get().addLog({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            type: 'system',
            result: 'ok',
            message: 'Loaded from offline cache — server unreachable',
          });
        }
      } catch (cacheErr) {
        console.error('No cached data available:', cacheErr);
      }
    }
  },

  connectToVmix: async () => {
    const { vmixHost, vmixPort } = get();
    try {
      await connectVmix(vmixHost, vmixPort);
      set({ vmixConnected: true });
      get().addLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'system',
        result: 'ok',
        message: `vMix connected at ${vmixHost}:${vmixPort}`,
      });

      // Listen for ACTS (clip position) events from Tauri/vMix
      if (actsUnlisten) actsUnlisten();
      actsUnlisten = await listenEvent('vmix-acts', async (payload) => {
        const update = payload as ClipPosition;
        set({ clipPosition: update });

        // Check timecode triggers
        const fired = await checkTimecodeTriggers(update.positionMs, update.durationMs);
        for (const elementId of fired) {
          get().cueElement(elementId);
        }
      });
    } catch (e) {
      console.error('Failed to connect to vMix:', e);
      set({ vmixConnected: false });
    }
  },

  disconnect: () => {
    const { ws } = get();
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (actsUnlisten) {
      actsUnlisten();
      actsUnlisten = null;
    }
    clearTimecodeTriggers().catch(() => {});
    if (ws) ws.close();
    set({
      show: null,
      config: null,
      blocks: [],
      serverConnected: false,
      wsConnected: false,
      vmixConnected: false,
      ws: null,
      requestedElementId: null,
      processedKeys: new Set(),
      showStartedAt: null,
      blockStartedAt: null,
      blockTimings: {},
      clipPosition: null,
    });
  },

  selectElement: (elementId) => set({ selectedElementId: elementId }),

  runPreflight: async () => {
    const { config, gtTemplates, blocks, vmixConnected } = get();
    if (!vmixConnected) {
      set({ preflightError: 'vMix not connected', preflightResults: null, preflightLoading: false });
      return;
    }
    set({ preflightLoading: true, preflightError: null });
    try {
      const elementInputKeys = new Set<string>();
      for (const block of blocks) {
        for (const el of block.elements) {
          if (el.vmix_input_key) {
            elementInputKeys.add(el.vmix_input_key);
          }
        }
      }

      const gtData = gtTemplates.map(gt => ({
        name: gt.name,
        vmix_input_key: gt.vmix_input_key,
        fields: gt.fields.map((f: { name: string }) => f.name),
      }));

      const preflightConfig = config ? {
        clip_pool_a_key: config.clip_pool_a_key || null,
        clip_pool_b_key: config.clip_pool_b_key || null,
        graphic_key: config.graphic_key || null,
        lower_third_key: config.lower_third_key || null,
      } : null;

      const results = await runPreflightCheck({
        config: preflightConfig,
        gt_templates: gtData,
        element_input_keys: Array.from(elementInputKeys),
      });

      set({ preflightResults: results, preflightLoading: false, preflightError: null });

      const errorCount = results.filter(r => r.level === 'error').length;
      const warnCount = results.filter(r => r.level === 'warning').length;
      get().addLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'system',
        result: errorCount > 0 ? 'error' : 'ok',
        message: `Pre-flight: ${results.length} checks — ${errorCount} errors, ${warnCount} warnings`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ preflightError: msg, preflightResults: null, preflightLoading: false });
    }
  },

  registerTriggersForCurrentBlock: async () => {
    const { blocks, currentBlockIdx } = get();
    const block = blocks[currentBlockIdx];
    if (!block) {
      await clearTimecodeTriggers().catch(() => {});
      return;
    }

    const triggers = block.elements
      .filter(el => el.trigger_type === 'timecode' && el.trigger_config)
      .map(el => ({
        element_id: el.id,
        trigger_config: JSON.stringify(el.trigger_config),
        clip_duration_ms: (el.duration_sec || 0) * 1000,
      }));

    if (triggers.length > 0) {
      await registerTimecodeTriggers(triggers).catch(e => {
        console.error('Failed to register timecode triggers:', e);
      });
    } else {
      await clearTimecodeTriggers().catch(() => {});
    }
  },

  nextBlock: (opts) => {
    const { currentBlockIdx, blocks, ws, show, blockStartedAt, blockTimings } = get();
    if (currentBlockIdx < blocks.length - 1) {
      const now = new Date().toISOString();
      const newIdx = currentBlockIdx + 1;
      const newTimings = { ...blockTimings };

      // Finalize outgoing block timing
      if (blockStartedAt) {
        const actualSec = Math.floor((Date.now() - new Date(blockStartedAt).getTime()) / 1000);
        newTimings[blocks[currentBlockIdx].id] = {
          startedAt: blockStartedAt,
          endedAt: now,
          actualDurationSec: actualSec,
        };
      }

      // Start new block timing
      newTimings[blocks[newIdx].id] = { startedAt: now, endedAt: null, actualDurationSec: null };

      set({ currentBlockIdx: newIdx, selectedElementId: null, blockStartedAt: now, blockTimings: newTimings });

      if (!opts?.fromRemote && ws && show) {
        ws.send(JSON.stringify({
          channel: 'execution',
          type: 'next_block',
          seq: ++seqCounter,
          idempotencyKey: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          payload: {
            blockId: blocks[newIdx].id,
            previousBlockId: blocks[currentBlockIdx].id,
            source: 'automator',
          },
        }));
      }

      get().addLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'next_block',
        result: 'ok',
        message: `→ ${blocks[newIdx].name}`,
      });

      // Register timecode triggers for the new block
      get().registerTriggersForCurrentBlock();
    }
  },

  prevBlock: (opts) => {
    const { currentBlockIdx, blocks, ws, show, blockTimings } = get();
    if (currentBlockIdx > 0) {
      const now = new Date().toISOString();
      const newIdx = currentBlockIdx - 1;
      const newTimings = { ...blockTimings };

      // Revert previous block: clear its timing so it's back to "current"
      delete newTimings[blocks[newIdx].id];
      newTimings[blocks[newIdx].id] = { startedAt: now, endedAt: null, actualDurationSec: null };

      set({ currentBlockIdx: newIdx, selectedElementId: null, blockStartedAt: now, blockTimings: newTimings });

      if (!opts?.fromRemote && ws && show) {
        ws.send(JSON.stringify({
          channel: 'execution',
          type: 'prev_block',
          seq: ++seqCounter,
          idempotencyKey: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          payload: {
            blockId: blocks[newIdx].id,
            source: 'automator',
          },
        }));
      }

      get().addLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'prev_block',
        result: 'ok',
        message: `← ${blocks[newIdx].name}`,
      });

      // Register timecode triggers for the new block
      get().registerTriggersForCurrentBlock();
    }
  },

  cueElement: async (elementId) => {
    const { blocks, config, ws, gtTemplates, currentClipPool } = get();
    // Find element and its actions
    let element = null;
    let actions: Action[] = [];
    for (const block of blocks) {
      for (const el of block.elements) {
        if (el.id === elementId) {
          element = el;
          actions = el.actions.filter(a => a.phase === 'on_cue');
          break;
        }
      }
      if (element) break;
    }

    if (!element) {
      get().addLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'cue',
        elementTitle: 'unknown',
        result: 'error',
        message: 'Element not found',
      });
      return;
    }

    // GT Template path: auto-generate SetText + OverlayIn actions
    if (element.gt_template_id && element.gt_field_values) {
      const gt = gtTemplates.find(t => t.id === element!.gt_template_id);
      if (gt) {
        const delayMs = config?.action_delay_ms || 50;
        const gtActions: Array<{ id: string; phase: string; vmix_function: string; vmix_input: string; vmix_params: Record<string, string>; delay_ms: number }> = gt.fields.map((field, i) => ({
          id: `gt-set-${i}`,
          phase: 'on_cue',
          vmix_function: 'SetText',
          vmix_input: gt.vmix_input_key,
          vmix_params: {
            SelectedName: field.name,
            Value: element!.gt_field_values?.[field.name] || field.default || '',
          },
          delay_ms: i > 0 ? delayMs : 0,
        }));
        // Add OverlayIn at the end
        gtActions.push({
          id: 'gt-overlay',
          phase: 'on_cue',
          vmix_function: `OverlayInput${gt.overlay_number}In`,
          vmix_input: gt.vmix_input_key,
          vmix_params: {},
          delay_ms: delayMs,
        });

        const idempotencyKey = crypto.randomUUID();
        const rustConfig = config ? {
          clip_pool_a_key: config.clip_pool_a_key,
          clip_pool_b_key: config.clip_pool_b_key,
        } : null;
        const result = await executeCue(elementId, gtActions, rustConfig);

        if (ws) {
          ws.send(JSON.stringify({
            channel: 'execution',
            type: result.ok ? 'cue_ack' : 'error',
            seq: ++seqCounter,
            idempotencyKey,
            timestamp: new Date().toISOString(),
            payload: {
              elementId,
              elementTitle: element.title,
              vmixResult: result.ok ? 'OK' : 'ERROR',
              latencyMs: result.latencyMs,
              source: 'automator',
            },
          }));
        }

        get().addLog({
          id: idempotencyKey,
          timestamp: new Date().toISOString(),
          type: 'cue',
          elementTitle: element.title || gt.name,
          vmixFunction: gtActions.map(a => a.vmix_function).join(' → '),
          result: result.ok ? 'ok' : 'error',
          latencyMs: result.latencyMs,
        });
        return;
      }
    }

    // Manual actions path (existing)
    if (actions.length === 0) {
      get().addLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'cue',
        elementTitle: element?.title || 'unknown',
        result: 'error',
        message: 'No on_cue actions',
      });
      return;
    }

    // Convert DB action format (target/field/value) to Rust engine format (vmix_input/vmix_params)
    const resolvedActions = actions.map(a => {
      const vmixParams: Record<string, string> = {};
      if (a.field) vmixParams['SelectedName'] = a.field;
      if (a.value) vmixParams['Value'] = resolveVar(a.value, config, currentClipPool) || '';
      return {
        id: a.id,
        phase: a.phase,
        vmix_function: a.vmix_function,
        vmix_input: resolveVar(a.target, config, currentClipPool),
        vmix_params: Object.keys(vmixParams).length > 0 ? vmixParams : null,
        delay_ms: a.delay_ms,
      };
    });

    const idempotencyKey = crypto.randomUUID();
    const rustConfig = config ? {
      clip_pool_a_key: config.clip_pool_a_key,
      clip_pool_b_key: config.clip_pool_b_key,
    } : null;
    const result = await executeCue(elementId, resolvedActions, rustConfig);

    // Toggle clip pool after cueing a clip element
    if (element.type === 'clip') {
      set({ currentClipPool: currentClipPool === 'a' ? 'b' : 'a' });
    }

    // Send to WS
    if (ws) {
      ws.send(JSON.stringify({
        channel: 'execution',
        type: result.ok ? 'cue_ack' : 'error',
        seq: ++seqCounter,
        idempotencyKey,
        timestamp: new Date().toISOString(),
        payload: {
          elementId,
          elementTitle: element.title,
          vmixResult: result.ok ? 'OK' : 'ERROR',
          latencyMs: result.latencyMs,
          source: 'automator',
        },
      }));
    }

    get().addLog({
      id: idempotencyKey,
      timestamp: new Date().toISOString(),
      type: 'cue',
      elementTitle: element.title || undefined,
      vmixFunction: actions.map(a => a.vmix_function).join(' → '),
      result: result.ok ? 'ok' : 'error',
      latencyMs: result.latencyMs,
    });
  },

  executeStep: async (elementId, stepLabel) => {
    const { blocks, config, ws, currentClipPool } = get();
    let element = null;
    let actions: Action[] = [];
    for (const block of blocks) {
      for (const el of block.elements) {
        if (el.id === elementId) {
          element = el;
          actions = el.actions.filter(a => a.phase === 'step' && a.step_label === stepLabel);
          break;
        }
      }
      if (element) break;
    }

    if (!element || actions.length === 0) return;

    // Convert to Rust engine format
    const resolvedActions = actions.map(a => {
      const vmixParams: Record<string, string> = {};
      if (a.field) vmixParams['SelectedName'] = a.field;
      if (a.value) vmixParams['Value'] = resolveVar(a.value, config, currentClipPool) || '';
      return {
        id: a.id,
        phase: a.phase,
        vmix_function: a.vmix_function,
        vmix_input: resolveVar(a.target, config, currentClipPool),
        vmix_params: Object.keys(vmixParams).length > 0 ? vmixParams : null,
        delay_ms: a.delay_ms,
      };
    });

    const idempotencyKey = crypto.randomUUID();
    const rustConfig = config ? {
      clip_pool_a_key: config.clip_pool_a_key,
      clip_pool_b_key: config.clip_pool_b_key,
    } : null;
    const result = await executeCue(elementId, resolvedActions, rustConfig);

    if (ws) {
      ws.send(JSON.stringify({
        channel: 'execution',
        type: result.ok ? 'cue_ack' : 'error',
        seq: ++seqCounter,
        idempotencyKey,
        timestamp: new Date().toISOString(),
        payload: {
          elementId,
          elementTitle: element.title,
          stepLabel,
          vmixResult: result.ok ? 'OK' : 'ERROR',
          latencyMs: result.latencyMs,
          source: 'automator',
        },
      }));
    }

    get().addLog({
      id: idempotencyKey,
      timestamp: new Date().toISOString(),
      type: 'step',
      elementTitle: `${element.title} [${stepLabel}]`,
      vmixFunction: actions.map(a => a.vmix_function).join(' → '),
      result: result.ok ? 'ok' : 'error',
      latencyMs: result.latencyMs,
    });
  },

  stopShow: async () => {
    const { show, serverUrl, ws } = get();
    if (!show) return;
    try {
      const res = await fetch(`${serverUrl}/api/shows/${show.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      });
      if (!res.ok) {
        get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: `STOP failed: ${res.status}` });
        return;
      }
      set({
        showStartedAt: null,
        blockStartedAt: null,
        blockTimings: {},
        currentBlockIdx: 0,
        selectedElementId: null,
        requestedElementId: null,
      });
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          channel: 'execution',
          type: 'show_status_changed',
          timestamp: new Date().toISOString(),
          payload: { status: 'ready', source: 'automator' },
        }));
      }
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'ok', message: 'STOP — show set to ready' });
    } catch (e) {
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: `STOP error: ${e}` });
    }
  },

  resetShow: async () => {
    const { show, serverUrl, blocks } = get();
    if (!show) return;
    try {
      // Set show to ready
      await fetch(`${serverUrl}/api/shows/${show.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      });
      // Reset all blocks to pending
      await Promise.all(blocks.map(b =>
        fetch(`${serverUrl}/api/shows/${show.id}/blocks/${b.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'pending', actual_duration_sec: null }),
        })
      ));
      set({
        currentBlockIdx: 0,
        showStartedAt: null,
        blockStartedAt: null,
        blockTimings: {},
        currentClipPool: 'a',
        selectedElementId: null,
        requestedElementId: null,
      });
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'ok', message: 'RESET — all blocks pending' });
    } catch (e) {
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: `RESET error: ${e}` });
    }
  },

  toggleRehearsal: async () => {
    const { show, serverUrl, ws } = get();
    if (!show) return;
    const newStatus = show.status === 'rehearsal' ? 'ready' : 'rehearsal';
    try {
      const res = await fetch(`${serverUrl}/api/shows/${show.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: `Rehearsal toggle failed: ${res.status}` });
        return;
      }
      if (newStatus === 'rehearsal') {
        const now = new Date().toISOString();
        set({ showStartedAt: now, blockStartedAt: now, blockTimings: {} });
      } else {
        set({ showStartedAt: null, blockStartedAt: null, blockTimings: {}, currentClipPool: 'a' });
      }
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          channel: 'execution',
          type: 'show_status_changed',
          timestamp: new Date().toISOString(),
          payload: { status: newStatus, source: 'automator' },
        }));
      }
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'ok', message: newStatus === 'rehearsal' ? 'REHEARSAL started' : 'REHEARSAL ended' });
    } catch (e) {
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: `Rehearsal error: ${e}` });
    }
  },

  panicCut: async () => {
    const { config, vmixConnected } = get();
    if (!vmixConnected || !config?.overrun_safe_input_key) {
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: 'PANIC: No safe input configured or vMix disconnected' });
      return;
    }
    try {
      const { sendVmixCommand } = await import('@/lib/tauri-api');
      const result = await sendVmixCommand('CutDirect', `Input=${config.overrun_safe_input_key}`);
      get().addLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'panic',
        vmixFunction: 'CutDirect',
        result: result.ok ? 'ok' : 'error',
        message: `PANIC CUT to ${config.overrun_safe_input_key}`,
      });
    } catch (e) {
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'panic', result: 'error', message: `PANIC error: ${e}` });
    }
  },

  addLog: (entry) => {
    set((s) => ({
      executionLog: [entry, ...s.executionLog].slice(0, 200),
    }));
  },

  handleWsMessage: (msg) => {
    const channel = msg.channel as string;
    const type = msg.type as string;
    const payload = msg.payload as Record<string, unknown>;

    if (channel === 'rundown') {
      // Reload rundown on any change
      if (['block_created', 'block_updated', 'block_deleted', 'element_created', 'element_updated', 'element_deleted', 'action_created', 'action_updated', 'action_deleted', 'gt_template_created', 'gt_template_updated', 'gt_template_deleted'].includes(type)) {
        const { show, serverUrl } = get();
        if (show) {
          fetchRundown(serverUrl, show.id).then(data => {
            set({ blocks: data.blocks, show: data.show, config: data.config, gtTemplates: data.gt_templates || [] });
          }).catch(() => {});
        }
      }
    }

    if (channel === 'execution') {
      // Skip own messages to avoid loops
      if (payload?.source === 'automator') return;

      // Dedup by idempotencyKey
      const key = msg.idempotencyKey as string | undefined;
      if (key) {
        const { processedKeys } = get();
        if (processedKeys.has(key)) return;
        const next = new Set(processedKeys);
        next.add(key);
        // Keep set bounded
        if (next.size > 500) {
          const arr = Array.from(next);
          arr.splice(0, 250);
          set({ processedKeys: new Set(arr) });
        } else {
          set({ processedKeys: next });
        }
      }

      const { executionMode, vmixConnected } = get();

      if (type === 'cue') {
        const elementId = payload?.elementId as string;
        if (!elementId) return;

        if (executionMode === 'auto') {
          if (!vmixConnected) {
            get().addLog({
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              type: 'cue',
              result: 'error',
              message: 'AUTO CUE rejected — vMix not connected',
            });
            return;
          }
          get().cueElement(elementId);
        } else {
          // MANUAL: highlight as requested
          set({ requestedElementId: elementId });
          get().addLog({
            id: (msg.idempotencyKey as string) || crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            type: 'cue',
            elementTitle: (payload?.elementTitle as string) || undefined,
            result: 'ok',
            message: 'CUE requested (manual mode)',
          });
        }
        return;
      }

      if (type === 'next_block') {
        if (executionMode === 'auto') {
          get().nextBlock({ fromRemote: true });
        }
        return;
      }

      if (type === 'prev_block') {
        if (executionMode === 'auto') {
          get().prevBlock({ fromRemote: true });
        }
        return;
      }

      // Show status changes — manage timing
      if (type === 'show_status_changed') {
        const status = payload?.status as string;
        if (status === 'live' || status === 'rehearsal') {
          const now = new Date().toISOString();
          set({
            showStartedAt: now,
            blockStartedAt: now,
            blockTimings: {},
          });
        }
        if (status === 'ready') {
          set({
            showStartedAt: null,
            blockStartedAt: null,
            blockTimings: {},
            currentClipPool: 'a',
          });
        }
      }

      // Default: log other execution messages
      get().addLog({
        id: (msg.idempotencyKey as string) || crypto.randomUUID(),
        timestamp: (msg.timestamp as string) || new Date().toISOString(),
        type,
        elementTitle: (payload?.elementTitle as string) || undefined,
        result: type === 'error' ? 'error' : 'ok',
        message: (payload?.error as string) || (payload?.vmixResult as string) || undefined,
        latencyMs: (payload?.latencyMs as number) || undefined,
      });
    }

    if (channel === 'media') {
      if (type === 'media_uploaded') {
        get().triggerMediaSync();
      }
      if (type === 'media_deleted') {
        const mediaId = payload?.mediaId as string;
        if (mediaId) {
          set((s) => ({
            mediaSyncStatus: s.mediaSyncStatus.filter((m) => m.id !== mediaId),
          }));
        }
      }
    }

    if (channel === 'tally') {
      set({
        tally: {
          program: (payload?.program as string) || null,
          preview: (payload?.preview as string) || null,
        },
      });
    }
  },
}));

function resolveVar(val: string | null, config: ShowConfig | null, currentPool: 'a' | 'b' = 'a'): string | null {
  if (!val || !config) return val;
  const activePoolKey = currentPool === 'a' ? config.clip_pool_a_key : config.clip_pool_b_key;
  return val
    .replace('{{clip_pool}}', activePoolKey)
    .replace('{{clip_pool_a}}', config.clip_pool_a_key)
    .replace('{{clip_pool_b}}', config.clip_pool_b_key)
    .replace('{{graphic}}', config.graphic_key)
    .replace('{{lower_third}}', config.lower_third_key);
}
