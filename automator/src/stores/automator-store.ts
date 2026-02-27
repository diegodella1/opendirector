import { create } from 'zustand';
import type { Show, ShowConfig, Block, LogEntry, TallyState, Action, MediaSyncState } from '@/lib/types';
import { fetchRundown, fetchShows, connectWebSocket, executeCue, connectVmix, syncMedia, getMediaSyncStatus, setMediaFolder as setMediaFolderApi } from '@/lib/tauri-api';

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

  // Execution
  currentBlockIdx: number;
  selectedElementId: string | null;
  executionLog: LogEntry[];

  // Tally
  tally: TallyState;

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
  selectElement: (elementId: string | null) => void;
  nextBlock: () => void;
  prevBlock: () => void;
  cueElement: (elementId: string) => Promise<void>;
  executeStep: (elementId: string, stepLabel: string) => Promise<void>;
  addLog: (entry: LogEntry) => void;
  handleWsMessage: (msg: Record<string, unknown>) => void;
}

let seqCounter = 0;

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
  currentBlockIdx: 0,
  selectedElementId: null,
  executionLog: [],
  tally: { program: null, preview: null },
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
        serverConnected: true,
        currentBlockIdx: 0,
        selectedElementId: null,
        executionLog: [],
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
      ws.onopen = () => set({ wsConnected: true });
      set({ ws });

      // Auto-trigger media sync
      get().triggerMediaSync();
    } catch (e) {
      console.error('Failed to connect to show:', e);
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
    } catch (e) {
      console.error('Failed to connect to vMix:', e);
      set({ vmixConnected: false });
    }
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) ws.close();
    set({
      show: null,
      config: null,
      blocks: [],
      serverConnected: false,
      wsConnected: false,
      vmixConnected: false,
      ws: null,
    });
  },

  selectElement: (elementId) => set({ selectedElementId: elementId }),

  nextBlock: () => {
    const { currentBlockIdx, blocks, ws, show } = get();
    if (currentBlockIdx < blocks.length - 1) {
      const newIdx = currentBlockIdx + 1;
      set({ currentBlockIdx: newIdx, selectedElementId: null });

      if (ws && show) {
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
    }
  },

  prevBlock: () => {
    const { currentBlockIdx, blocks, ws, show } = get();
    if (currentBlockIdx > 0) {
      const newIdx = currentBlockIdx - 1;
      set({ currentBlockIdx: newIdx, selectedElementId: null });

      if (ws && show) {
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
    }
  },

  cueElement: async (elementId) => {
    const { blocks, config, ws } = get();
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

    if (!element || actions.length === 0) {
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

    // Resolve variables in targets
    const resolvedActions = actions.map(a => ({
      vmix_function: a.vmix_function,
      target: resolveVar(a.target, config),
      field: a.field,
      value: resolveVar(a.value, config),
      delay_ms: a.delay_ms,
    }));

    const idempotencyKey = crypto.randomUUID();
    const result = await executeCue(elementId, resolvedActions);

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
    const { blocks, config, ws } = get();
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

    const resolvedActions = actions.map(a => ({
      vmix_function: a.vmix_function,
      target: resolveVar(a.target, config),
      field: a.field,
      value: resolveVar(a.value, config),
      delay_ms: a.delay_ms,
    }));

    const idempotencyKey = crypto.randomUUID();
    const result = await executeCue(elementId, resolvedActions);

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
      if (['block_created', 'block_updated', 'block_deleted', 'element_created', 'element_updated', 'element_deleted', 'action_created', 'action_updated', 'action_deleted'].includes(type)) {
        const { show, serverUrl } = get();
        if (show) {
          fetchRundown(serverUrl, show.id).then(data => {
            set({ blocks: data.blocks, show: data.show, config: data.config });
          }).catch(() => {});
        }
      }
    }

    if (channel === 'execution') {
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

function resolveVar(val: string | null, config: ShowConfig | null): string | null {
  if (!val || !config) return val;
  return val
    .replace('{{clip_pool}}', config.clip_pool_a_key)
    .replace('{{clip_pool_a}}', config.clip_pool_a_key)
    .replace('{{clip_pool_b}}', config.clip_pool_b_key)
    .replace('{{graphic}}', config.graphic_key)
    .replace('{{lower_third}}', config.lower_third_key);
}
