import { create } from 'zustand';
import type { Show, ShowConfig, Block, LogEntry, TallyState, Action, MediaSyncState, GtTemplate, ClipPosition } from '@/lib/types';
import { fetchRundown, fetchShows, connectWebSocket, executeCue, connectVmix, syncMedia, getMediaSyncStatus, setMediaFolder as setMediaFolderApi, loadCachedRundown, listenEvent, registerTimecodeTriggers, clearTimecodeTriggers, checkTimecodeTriggers, runPreflightCheck, setActiveShow } from '@/lib/tauri-api';
import type { PreflightCheck } from '@/lib/tauri-api';
import type { BlockTiming } from '@/lib/timing';

// ── Per-show tab state ──────────────────────────────────────────────

export interface ShowTab {
  show: Show;
  config: ShowConfig | null;
  blocks: Block[];
  gtTemplates: GtTemplate[];

  currentBlockIdx: number;
  selectedElementId: string | null;
  executionLog: LogEntry[];

  executionMode: 'auto' | 'manual';
  requestedElementId: string | null;
  processedKeys: Set<string>;

  showStartedAt: string | null;
  blockStartedAt: string | null;
  blockTimings: Record<string, BlockTiming>;

  currentClipPool: 'a' | 'b';
  clipPosition: ClipPosition | null;

  preflightResults: PreflightCheck[] | null;
  preflightLoading: boolean;
  preflightError: string | null;

  ws: WebSocket | null;
  wsConnected: boolean;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  seqCounter: number;

  mediaSyncStatus: MediaSyncState[];
}

function createShowTab(show: Show, config: ShowConfig | null, blocks: Block[], gtTemplates: GtTemplate[]): ShowTab {
  return {
    show, config, blocks, gtTemplates,
    currentBlockIdx: 0, selectedElementId: null, executionLog: [],
    executionMode: 'manual', requestedElementId: null, processedKeys: new Set(),
    showStartedAt: null, blockStartedAt: null, blockTimings: {},
    currentClipPool: 'a', clipPosition: null,
    preflightResults: null, preflightLoading: false, preflightError: null,
    ws: null, wsConnected: false, heartbeatInterval: null, seqCounter: 0,
    mediaSyncStatus: [],
  };
}

// ── Store interface ─────────────────────────────────────────────────

interface AutomatorState {
  // Global (shared across tabs)
  serverUrl: string;
  vmixHost: string;
  vmixPort: number;
  vmixConnected: boolean;
  serverConnected: boolean;
  shows: Show[];
  mediaFolder: string;
  tally: TallyState;

  // Tabs
  tabs: Map<string, ShowTab>;
  activeTabId: string | null;

  // Global actions
  setServerUrl: (url: string) => void;
  setVmixHost: (host: string) => void;
  setVmixPort: (port: number) => void;
  setMediaFolder: (folder: string) => void;
  loadShows: () => Promise<void>;
  connectToVmix: () => Promise<void>;
  disconnectAll: () => void;

  // Tab actions
  openTab: (showId: string) => Promise<void>;
  switchTab: (showId: string) => void;
  closeTab: (showId: string) => void;

  // Active-tab actions (operate on the active tab)
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
  triggerMediaSync: () => Promise<void>;
  updateMediaProgress: (id: string, progress: number) => void;
  markMediaSynced: (id: string, localPath: string) => void;
  markMediaError: (id: string, error: string) => void;
  setMediaSyncStatus: (status: MediaSyncState[]) => void;

  // WS handler (receives showId to route to correct tab)
  handleWsMessage: (showId: string, msg: Record<string, unknown>) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────

let actsUnlisten: (() => void) | null = null;

/** Get the active tab or null. */
function getTab(state: AutomatorState): ShowTab | null {
  if (!state.activeTabId) return null;
  return state.tabs.get(state.activeTabId) ?? null;
}

/** Update a specific tab in-place and return new Map. */
function updateTab(tabs: Map<string, ShowTab>, showId: string, patch: Partial<ShowTab>): Map<string, ShowTab> {
  const tab = tabs.get(showId);
  if (!tab) return tabs;
  const next = new Map(tabs);
  next.set(showId, { ...tab, ...patch });
  return next;
}

// ── Store ───────────────────────────────────────────────────────────

export const useAutomatorStore = create<AutomatorState>((set, get) => ({
  serverUrl: 'http://100.92.92.27:3000',
  vmixHost: '127.0.0.1',
  vmixPort: 8099,
  vmixConnected: false,
  serverConnected: false,
  shows: [],
  mediaFolder: 'C:\\OpenDirector\\Media',
  tally: { program: null, preview: null },
  tabs: new Map(),
  activeTabId: null,

  // ── Global actions ──────────────────────────────────────────────

  setServerUrl: (url) => set({ serverUrl: url }),
  setVmixHost: (host) => set({ vmixHost: host }),
  setVmixPort: (port) => set({ vmixPort: port }),

  setMediaFolder: (folder) => {
    set({ mediaFolder: folder });
    setMediaFolderApi(folder).catch(() => {});
  },

  loadShows: async () => {
    try {
      const shows = await fetchShows(get().serverUrl);
      set({ shows });
    } catch (e) {
      console.error('Failed to load shows:', e);
    }
  },

  connectToVmix: async () => {
    const { vmixHost, vmixPort } = get();
    try {
      await connectVmix(vmixHost, vmixPort);
      set({ vmixConnected: true });

      // Log to active tab if one exists
      const tab = getTab(get());
      if (tab) {
        const entry: LogEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: 'system',
          result: 'ok',
          message: `vMix connected at ${vmixHost}:${vmixPort}`,
        };
        set({ tabs: updateTab(get().tabs, get().activeTabId!, { executionLog: [entry, ...tab.executionLog].slice(0, 200) }) });
      }

      // Listen for ACTS (clip position) events from Tauri/vMix
      if (actsUnlisten) actsUnlisten();
      actsUnlisten = await listenEvent('vmix-acts', async (payload) => {
        const update = payload as ClipPosition;
        const { activeTabId, tabs: currentTabs } = get();
        if (!activeTabId) return;
        set({ tabs: updateTab(currentTabs, activeTabId, { clipPosition: update }) });

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

  disconnectAll: () => {
    const { tabs } = get();
    // Close all tab WebSockets
    for (const [, tab] of tabs) {
      if (tab.heartbeatInterval) clearInterval(tab.heartbeatInterval);
      if (tab.ws) tab.ws.close();
    }
    if (actsUnlisten) {
      actsUnlisten();
      actsUnlisten = null;
    }
    clearTimecodeTriggers().catch(() => {});
    set({
      tabs: new Map(),
      activeTabId: null,
      serverConnected: false,
      vmixConnected: false,
    });
  },

  // ── Tab actions ─────────────────────────────────────────────────

  openTab: async (showId: string) => {
    const { serverUrl, tabs } = get();

    // If tab already open, just switch to it
    if (tabs.has(showId)) {
      get().switchTab(showId);
      return;
    }

    try {
      const data = await fetchRundown(serverUrl, showId);
      const tab = createShowTab(data.show, data.config, data.blocks, data.gt_templates || []);

      // Connect WebSocket for this tab
      const ws = connectWebSocket(serverUrl, showId);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          get().handleWsMessage(showId, msg);
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        set({ tabs: updateTab(get().tabs, showId, { wsConnected: false }) });
      };
      ws.onopen = () => {
        const currentTab = get().tabs.get(showId);
        if (!currentTab) return;
        set({ tabs: updateTab(get().tabs, showId, { wsConnected: true }) });
        // Announce automator presence
        ws.send(JSON.stringify({
          channel: 'execution',
          type: 'automator_status',
          timestamp: new Date().toISOString(),
          payload: { connected: true, mode: currentTab.executionMode, source: 'automator' },
        }));
        // Start heartbeat
        const hb = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const t = get().tabs.get(showId);
            ws.send(JSON.stringify({
              channel: 'execution',
              type: 'automator_heartbeat',
              timestamp: new Date().toISOString(),
              payload: { mode: t?.executionMode || 'manual', source: 'automator' },
            }));
          }
        }, 5000);
        set({ tabs: updateTab(get().tabs, showId, { heartbeatInterval: hb }) });
      };

      tab.ws = ws;
      const newTabs = new Map(tabs);
      newTabs.set(showId, tab);
      set({ tabs: newTabs, activeTabId: showId, serverConnected: true });

      // Tell Rust which show is active
      setActiveShow(showId).catch(() => {});

      // Trigger media sync for the new tab
      get().triggerMediaSync();

      // Register timecode triggers
      get().registerTriggersForCurrentBlock();
    } catch (e) {
      console.error('Failed to open tab:', e);
      // Offline fallback
      try {
        const cached = await loadCachedRundown(showId) as { show: Show; config: ShowConfig | null; blocks: Block[]; gt_templates: GtTemplate[]; _cached?: boolean } | null;
        if (cached?.show) {
          const tab = createShowTab(cached.show, cached.config, cached.blocks, cached.gt_templates || []);
          const entry: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            type: 'system',
            result: 'ok',
            message: 'Loaded from offline cache -- server unreachable',
          };
          tab.executionLog = [entry];
          const newTabs = new Map(get().tabs);
          newTabs.set(showId, tab);
          set({ tabs: newTabs, activeTabId: showId });
        }
      } catch (cacheErr) {
        console.error('No cached data available:', cacheErr);
      }
    }
  },

  switchTab: (showId: string) => {
    const { tabs } = get();
    if (!tabs.has(showId)) return;
    set({ activeTabId: showId });
    setActiveShow(showId).catch(() => {});
    // Re-register timecode triggers for this tab's current block
    get().registerTriggersForCurrentBlock();
  },

  closeTab: (showId: string) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.get(showId);
    if (!tab) return;

    // Cleanup
    if (tab.heartbeatInterval) clearInterval(tab.heartbeatInterval);
    if (tab.ws) tab.ws.close();

    const newTabs = new Map(tabs);
    newTabs.delete(showId);

    // Determine new active tab
    let newActive: string | null = null;
    if (activeTabId === showId) {
      // Switch to another tab if available
      const remaining = Array.from(newTabs.keys());
      newActive = remaining.length > 0 ? remaining[0] : null;
    } else {
      newActive = activeTabId;
    }

    set({ tabs: newTabs, activeTabId: newActive, serverConnected: newTabs.size > 0 });
    if (newActive) {
      setActiveShow(newActive).catch(() => {});
      get().registerTriggersForCurrentBlock();
    } else {
      clearTimecodeTriggers().catch(() => {});
    }
  },

  // ── Active-tab actions ──────────────────────────────────────────

  setExecutionMode: (mode) => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const ws = tab.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        channel: 'execution',
        type: 'automator_mode',
        timestamp: new Date().toISOString(),
        payload: { mode, source: 'automator' },
      }));
    }
    set({ tabs: updateTab(tabs, activeTabId, { executionMode: mode }) });
  },

  clearRequestedElement: () => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    set({ tabs: updateTab(tabs, activeTabId, { requestedElementId: null }) });
  },

  selectElement: (elementId) => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    set({ tabs: updateTab(tabs, activeTabId, { selectedElementId: elementId }) });
  },

  nextBlock: (opts) => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const { currentBlockIdx, blocks, ws, show, blockStartedAt, blockTimings } = tab;

    if (currentBlockIdx < blocks.length - 1) {
      const now = new Date().toISOString();
      const newIdx = currentBlockIdx + 1;
      const newTimings = { ...blockTimings };

      if (blockStartedAt) {
        const actualSec = Math.floor((Date.now() - new Date(blockStartedAt).getTime()) / 1000);
        newTimings[blocks[currentBlockIdx].id] = {
          startedAt: blockStartedAt,
          endedAt: now,
          actualDurationSec: actualSec,
        };
      }

      newTimings[blocks[newIdx].id] = { startedAt: now, endedAt: null, actualDurationSec: null };
      const seq = tab.seqCounter + 1;

      set({ tabs: updateTab(tabs, activeTabId, {
        currentBlockIdx: newIdx, selectedElementId: null, blockStartedAt: now, blockTimings: newTimings, seqCounter: seq,
      }) });

      if (!opts?.fromRemote && ws && show) {
        ws.send(JSON.stringify({
          channel: 'execution',
          type: 'next_block',
          seq,
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
        message: `-> ${blocks[newIdx].name}`,
      });

      get().registerTriggersForCurrentBlock();
    }
  },

  prevBlock: (opts) => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const { currentBlockIdx, blocks, ws, show, blockTimings } = tab;

    if (currentBlockIdx > 0) {
      const now = new Date().toISOString();
      const newIdx = currentBlockIdx - 1;
      const newTimings = { ...blockTimings };

      delete newTimings[blocks[newIdx].id];
      newTimings[blocks[newIdx].id] = { startedAt: now, endedAt: null, actualDurationSec: null };
      const seq = tab.seqCounter + 1;

      set({ tabs: updateTab(tabs, activeTabId, {
        currentBlockIdx: newIdx, selectedElementId: null, blockStartedAt: now, blockTimings: newTimings, seqCounter: seq,
      }) });

      if (!opts?.fromRemote && ws && show) {
        ws.send(JSON.stringify({
          channel: 'execution',
          type: 'prev_block',
          seq,
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
        message: `<- ${blocks[newIdx].name}`,
      });

      get().registerTriggersForCurrentBlock();
    }
  },

  cueElement: async (elementId) => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const { blocks, config, ws, gtTemplates, currentClipPool } = tab;

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

    // GT Template path
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
        gtActions.push({
          id: 'gt-overlay',
          phase: 'on_cue',
          vmix_function: `OverlayInput${gt.overlay_number}In`,
          vmix_input: gt.vmix_input_key,
          vmix_params: {},
          delay_ms: delayMs,
        });

        const idempotencyKey = crypto.randomUUID();
        const rustConfig = config ? { clip_pool_a_key: config.clip_pool_a_key, clip_pool_b_key: config.clip_pool_b_key } : null;
        const result = await executeCue(elementId, gtActions, rustConfig);

        if (ws) {
          const seq = (get().tabs.get(activeTabId)?.seqCounter ?? 0) + 1;
          set({ tabs: updateTab(get().tabs, activeTabId, { seqCounter: seq }) });
          ws.send(JSON.stringify({
            channel: 'execution',
            type: result.ok ? 'cue_ack' : 'error',
            seq, idempotencyKey,
            timestamp: new Date().toISOString(),
            payload: { elementId, elementTitle: element.title, vmixResult: result.ok ? 'OK' : 'ERROR', latencyMs: result.latencyMs, source: 'automator' },
          }));
        }

        get().addLog({
          id: idempotencyKey,
          timestamp: new Date().toISOString(),
          type: 'cue',
          elementTitle: element.title || gt.name,
          vmixFunction: gtActions.map(a => a.vmix_function).join(' -> '),
          result: result.ok ? 'ok' : 'error',
          latencyMs: result.latencyMs,
        });
        return;
      }
    }

    // Manual actions path
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
    const rustConfig = config ? { clip_pool_a_key: config.clip_pool_a_key, clip_pool_b_key: config.clip_pool_b_key } : null;
    const result = await executeCue(elementId, resolvedActions, rustConfig);

    // Toggle clip pool
    if (element.type === 'clip') {
      set({ tabs: updateTab(get().tabs, activeTabId, { currentClipPool: currentClipPool === 'a' ? 'b' : 'a' }) });
    }

    if (ws) {
      const seq = (get().tabs.get(activeTabId)?.seqCounter ?? 0) + 1;
      set({ tabs: updateTab(get().tabs, activeTabId, { seqCounter: seq }) });
      ws.send(JSON.stringify({
        channel: 'execution',
        type: result.ok ? 'cue_ack' : 'error',
        seq, idempotencyKey,
        timestamp: new Date().toISOString(),
        payload: { elementId, elementTitle: element.title, vmixResult: result.ok ? 'OK' : 'ERROR', latencyMs: result.latencyMs, source: 'automator' },
      }));
    }

    get().addLog({
      id: idempotencyKey,
      timestamp: new Date().toISOString(),
      type: 'cue',
      elementTitle: element.title || undefined,
      vmixFunction: actions.map(a => a.vmix_function).join(' -> '),
      result: result.ok ? 'ok' : 'error',
      latencyMs: result.latencyMs,
    });
  },

  executeStep: async (elementId, stepLabel) => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const { blocks, config, ws, currentClipPool } = tab;

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
    const rustConfig = config ? { clip_pool_a_key: config.clip_pool_a_key, clip_pool_b_key: config.clip_pool_b_key } : null;
    const result = await executeCue(elementId, resolvedActions, rustConfig);

    if (ws) {
      const seq = (get().tabs.get(activeTabId)?.seqCounter ?? 0) + 1;
      set({ tabs: updateTab(get().tabs, activeTabId, { seqCounter: seq }) });
      ws.send(JSON.stringify({
        channel: 'execution',
        type: result.ok ? 'cue_ack' : 'error',
        seq, idempotencyKey,
        timestamp: new Date().toISOString(),
        payload: { elementId, elementTitle: element.title, stepLabel, vmixResult: result.ok ? 'OK' : 'ERROR', latencyMs: result.latencyMs, source: 'automator' },
      }));
    }

    get().addLog({
      id: idempotencyKey,
      timestamp: new Date().toISOString(),
      type: 'step',
      elementTitle: `${element.title} [${stepLabel}]`,
      vmixFunction: actions.map(a => a.vmix_function).join(' -> '),
      result: result.ok ? 'ok' : 'error',
      latencyMs: result.latencyMs,
    });
  },

  registerTriggersForCurrentBlock: async () => {
    const tab = getTab(get());
    if (!tab) {
      await clearTimecodeTriggers().catch(() => {});
      return;
    }
    const block = tab.blocks[tab.currentBlockIdx];
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

  runPreflight: async () => {
    const { activeTabId, tabs, vmixConnected } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;

    if (!vmixConnected) {
      set({ tabs: updateTab(tabs, activeTabId, { preflightError: 'vMix not connected', preflightResults: null, preflightLoading: false }) });
      return;
    }
    set({ tabs: updateTab(get().tabs, activeTabId, { preflightLoading: true, preflightError: null }) });
    try {
      const { config, gtTemplates, blocks } = get().tabs.get(activeTabId)!;
      const elementInputKeys = new Set<string>();
      for (const block of blocks) {
        for (const el of block.elements) {
          if (el.vmix_input_key) elementInputKeys.add(el.vmix_input_key);
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

      const results = await runPreflightCheck({ config: preflightConfig, gt_templates: gtData, element_input_keys: Array.from(elementInputKeys) });
      set({ tabs: updateTab(get().tabs, activeTabId, { preflightResults: results, preflightLoading: false, preflightError: null }) });

      const errorCount = results.filter(r => r.level === 'error').length;
      const warnCount = results.filter(r => r.level === 'warning').length;
      get().addLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'system',
        result: errorCount > 0 ? 'error' : 'ok',
        message: `Pre-flight: ${results.length} checks -- ${errorCount} errors, ${warnCount} warnings`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ tabs: updateTab(get().tabs, activeTabId, { preflightError: msg, preflightResults: null, preflightLoading: false }) });
    }
  },

  stopShow: async () => {
    const { activeTabId, tabs, serverUrl } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab?.show) return;
    try {
      const res = await fetch(`${serverUrl}/api/shows/${tab.show.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      });
      if (!res.ok) {
        get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: `STOP failed: ${res.status}` });
        return;
      }
      set({ tabs: updateTab(get().tabs, activeTabId, {
        showStartedAt: null, blockStartedAt: null, blockTimings: {},
        currentBlockIdx: 0, selectedElementId: null, requestedElementId: null,
      }) });
      if (tab.ws?.readyState === WebSocket.OPEN) {
        tab.ws.send(JSON.stringify({
          channel: 'execution', type: 'show_status_changed', timestamp: new Date().toISOString(),
          payload: { status: 'ready', source: 'automator' },
        }));
      }
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'ok', message: 'STOP -- show set to ready' });
    } catch (e) {
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: `STOP error: ${e}` });
    }
  },

  resetShow: async () => {
    const { activeTabId, tabs, serverUrl } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab?.show) return;
    try {
      await fetch(`${serverUrl}/api/shows/${tab.show.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      });
      await Promise.all(tab.blocks.map(b =>
        fetch(`${serverUrl}/api/shows/${tab.show.id}/blocks/${b.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'pending', actual_duration_sec: null }),
        })
      ));
      set({ tabs: updateTab(get().tabs, activeTabId, {
        currentBlockIdx: 0, showStartedAt: null, blockStartedAt: null, blockTimings: {},
        currentClipPool: 'a', selectedElementId: null, requestedElementId: null,
      }) });
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'ok', message: 'RESET -- all blocks pending' });
    } catch (e) {
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: `RESET error: ${e}` });
    }
  },

  toggleRehearsal: async () => {
    const { activeTabId, tabs, serverUrl } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab?.show) return;
    const newStatus = tab.show.status === 'rehearsal' ? 'ready' : 'rehearsal';
    try {
      const res = await fetch(`${serverUrl}/api/shows/${tab.show.id}/status`, {
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
        set({ tabs: updateTab(get().tabs, activeTabId, { showStartedAt: now, blockStartedAt: now, blockTimings: {} }) });
      } else {
        set({ tabs: updateTab(get().tabs, activeTabId, { showStartedAt: null, blockStartedAt: null, blockTimings: {}, currentClipPool: 'a' }) });
      }
      if (tab.ws?.readyState === WebSocket.OPEN) {
        tab.ws.send(JSON.stringify({
          channel: 'execution', type: 'show_status_changed', timestamp: new Date().toISOString(),
          payload: { status: newStatus, source: 'automator' },
        }));
      }
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'ok', message: newStatus === 'rehearsal' ? 'REHEARSAL started' : 'REHEARSAL ended' });
    } catch (e) {
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: `Rehearsal error: ${e}` });
    }
  },

  panicCut: async () => {
    const tab = getTab(get());
    const { vmixConnected } = get();
    if (!vmixConnected || !tab?.config?.overrun_safe_input_key) {
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'system', result: 'error', message: 'PANIC: No safe input configured or vMix disconnected' });
      return;
    }
    try {
      const { sendVmixCommand } = await import('@/lib/tauri-api');
      const result = await sendVmixCommand('CutDirect', `Input=${tab.config.overrun_safe_input_key}`);
      get().addLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'panic',
        vmixFunction: 'CutDirect',
        result: result.ok ? 'ok' : 'error',
        message: `PANIC CUT to ${tab.config.overrun_safe_input_key}`,
      });
    } catch (e) {
      get().addLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'panic', result: 'error', message: `PANIC error: ${e}` });
    }
  },

  addLog: (entry) => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    set({ tabs: updateTab(tabs, activeTabId, { executionLog: [entry, ...tab.executionLog].slice(0, 200) }) });
  },

  triggerMediaSync: async () => {
    try {
      await syncMedia();
      const status = await getMediaSyncStatus() as MediaSyncState[];
      const { activeTabId, tabs } = get();
      if (activeTabId) {
        set({ tabs: updateTab(tabs, activeTabId, { mediaSyncStatus: status }) });
      }
    } catch (e) {
      console.error('Failed to trigger media sync:', e);
    }
  },

  updateMediaProgress: (id, progress) => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    set({ tabs: updateTab(tabs, activeTabId, {
      mediaSyncStatus: tab.mediaSyncStatus.map(m => m.id === id ? { ...m, status: 'downloading' as const, progress } : m),
    }) });
  },

  markMediaSynced: (id, localPath) => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    set({ tabs: updateTab(tabs, activeTabId, {
      mediaSyncStatus: tab.mediaSyncStatus.map(m => m.id === id ? { ...m, status: 'synced' as const, progress: 1, local_path: localPath } : m),
    }) });
  },

  markMediaError: (id, error) => {
    const { activeTabId, tabs } = get();
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    set({ tabs: updateTab(tabs, activeTabId, {
      mediaSyncStatus: tab.mediaSyncStatus.map(m => m.id === id ? { ...m, status: 'error' as const, error } : m),
    }) });
  },

  setMediaSyncStatus: (status) => {
    const { activeTabId, tabs } = get();
    if (activeTabId) set({ tabs: updateTab(tabs, activeTabId, { mediaSyncStatus: status }) });
  },

  // ── WS handler (scoped to showId) ──────────────────────────────

  handleWsMessage: (showId: string, msg: Record<string, unknown>) => {
    const { tabs, activeTabId, serverUrl } = get();
    const tab = tabs.get(showId);
    if (!tab) return;

    const channel = msg.channel as string;
    const type = msg.type as string;
    const payload = msg.payload as Record<string, unknown>;

    if (channel === 'rundown') {
      if (['block_created', 'block_updated', 'block_deleted', 'element_created', 'element_updated', 'element_deleted', 'action_created', 'action_updated', 'action_deleted', 'gt_template_created', 'gt_template_updated', 'gt_template_deleted'].includes(type)) {
        fetchRundown(serverUrl, showId).then(data => {
          set({ tabs: updateTab(get().tabs, showId, { blocks: data.blocks, show: data.show, config: data.config, gtTemplates: data.gt_templates || [] }) });
        }).catch(() => {});
      }
    }

    if (channel === 'execution') {
      // Skip own messages
      if (payload?.source === 'automator') return;

      // Dedup
      const key = msg.idempotencyKey as string | undefined;
      if (key) {
        if (tab.processedKeys.has(key)) return;
        const next = new Set(tab.processedKeys);
        next.add(key);
        if (next.size > 500) {
          const arr = Array.from(next);
          arr.splice(0, 250);
          set({ tabs: updateTab(get().tabs, showId, { processedKeys: new Set(arr) }) });
        } else {
          set({ tabs: updateTab(get().tabs, showId, { processedKeys: next }) });
        }
      }

      // Only process execution commands for the active tab
      const isActive = showId === activeTabId;

      if (type === 'cue') {
        const elementId = payload?.elementId as string;
        if (!elementId) return;
        const currentTab = get().tabs.get(showId);
        if (!currentTab) return;

        if (isActive && currentTab.executionMode === 'auto') {
          if (!get().vmixConnected) {
            // Add log to this specific tab
            const logEntry: LogEntry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'cue', result: 'error', message: 'AUTO CUE rejected -- vMix not connected' };
            set({ tabs: updateTab(get().tabs, showId, { executionLog: [logEntry, ...currentTab.executionLog].slice(0, 200) }) });
            return;
          }
          get().cueElement(elementId);
        } else {
          set({ tabs: updateTab(get().tabs, showId, { requestedElementId: elementId }) });
          const logEntry: LogEntry = {
            id: (msg.idempotencyKey as string) || crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            type: 'cue',
            elementTitle: (payload?.elementTitle as string) || undefined,
            result: 'ok',
            message: 'CUE requested (manual mode)',
          };
          set({ tabs: updateTab(get().tabs, showId, { executionLog: [logEntry, ...(get().tabs.get(showId)?.executionLog || [])].slice(0, 200) }) });
        }
        return;
      }

      if (type === 'next_block' && isActive) {
        const currentTab = get().tabs.get(showId);
        if (currentTab?.executionMode === 'auto') {
          get().nextBlock({ fromRemote: true });
        }
        return;
      }

      if (type === 'prev_block' && isActive) {
        const currentTab = get().tabs.get(showId);
        if (currentTab?.executionMode === 'auto') {
          get().prevBlock({ fromRemote: true });
        }
        return;
      }

      // Show status changes
      if (type === 'show_status_changed') {
        const status = payload?.status as string;
        if (status === 'live' || status === 'rehearsal') {
          const now = new Date().toISOString();
          set({ tabs: updateTab(get().tabs, showId, { showStartedAt: now, blockStartedAt: now, blockTimings: {} }) });
        }
        if (status === 'ready') {
          set({ tabs: updateTab(get().tabs, showId, { showStartedAt: null, blockStartedAt: null, blockTimings: {}, currentClipPool: 'a' }) });
        }
      }

      // Default: log
      const currentTab2 = get().tabs.get(showId);
      if (currentTab2) {
        const logEntry: LogEntry = {
          id: (msg.idempotencyKey as string) || crypto.randomUUID(),
          timestamp: (msg.timestamp as string) || new Date().toISOString(),
          type,
          elementTitle: (payload?.elementTitle as string) || undefined,
          result: type === 'error' ? 'error' : 'ok',
          message: (payload?.error as string) || (payload?.vmixResult as string) || undefined,
          latencyMs: (payload?.latencyMs as number) || undefined,
        };
        set({ tabs: updateTab(get().tabs, showId, { executionLog: [logEntry, ...currentTab2.executionLog].slice(0, 200) }) });
      }
    }

    if (channel === 'media') {
      if (type === 'media_uploaded') {
        get().triggerMediaSync();
      }
      if (type === 'media_deleted') {
        const mediaId = payload?.mediaId as string;
        if (mediaId) {
          const currentTab = get().tabs.get(showId);
          if (currentTab) {
            set({ tabs: updateTab(get().tabs, showId, { mediaSyncStatus: currentTab.mediaSyncStatus.filter(m => m.id !== mediaId) }) });
          }
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

// ── Hook helper for components ──────────────────────────────────────

export function useActiveShowState() {
  return useAutomatorStore(s => {
    const tab = s.activeTabId ? s.tabs.get(s.activeTabId) : null;
    return {
      show: tab?.show ?? null,
      config: tab?.config ?? null,
      blocks: tab?.blocks ?? [],
      gtTemplates: tab?.gtTemplates ?? [],
      currentBlockIdx: tab?.currentBlockIdx ?? 0,
      selectedElementId: tab?.selectedElementId ?? null,
      executionLog: tab?.executionLog ?? [],
      executionMode: tab?.executionMode ?? ('manual' as const),
      requestedElementId: tab?.requestedElementId ?? null,
      showStartedAt: tab?.showStartedAt ?? null,
      blockStartedAt: tab?.blockStartedAt ?? null,
      blockTimings: tab?.blockTimings ?? {},
      currentClipPool: tab?.currentClipPool ?? ('a' as const),
      clipPosition: tab?.clipPosition ?? null,
      preflightResults: tab?.preflightResults ?? null,
      preflightLoading: tab?.preflightLoading ?? false,
      preflightError: tab?.preflightError ?? null,
      wsConnected: tab?.wsConnected ?? false,
      mediaSyncStatus: tab?.mediaSyncStatus ?? [],
    };
  });
}

// ── Utilities ───────────────────────────────────────────────────────

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
