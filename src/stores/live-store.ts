'use client';

import { create } from 'zustand';
import type { Signal, ExecutionLogEntry, TallyState, Block, Element } from '@/lib/types';

interface BlockWithElements extends Block {
  elements: Element[];
}

interface LiveStoreState {
  // Show data
  showId: string | null;
  showName: string;
  showStatus: string;
  blocks: BlockWithElements[];
  currentBlockId: string | null;

  // Timing
  showStartedAt: string | null;
  blockStartedAt: string | null;

  // Live data
  signals: Signal[];
  executionLog: ExecutionLogEntry[];
  tally: TallyState;

  // WebSocket
  ws: WebSocket | null;
  wsConnected: boolean;

  // Element execution state
  triggeredElements: Set<string>;

  // Automator tracking
  automatorConnected: boolean;
  automatorMode: 'auto' | 'manual' | 'unknown';

  // Actions
  loadShow: (showId: string) => Promise<void>;
  connectWs: (showId: string) => void;
  disconnectWs: () => void;
  sendSignal: (showId: string, type: string, value?: string) => Promise<void>;
  clearSignals: (showId: string) => Promise<void>;
  setCurrentBlock: (blockId: string | null) => void;

  // Execution commands
  sendExecutionCommand: (type: string, payload?: Record<string, unknown>) => void;
  cueElement: (elementId: string) => void;
  nextBlock: () => void;
  prevBlock: () => void;
  stopShow: () => Promise<void>;
  goLive: () => Promise<void>;
  goReady: () => Promise<void>;
  goRehearsal: () => Promise<void>;
}

let automatorTimeout: ReturnType<typeof setTimeout> | null = null;

export const useLiveStore = create<LiveStoreState>((set, get) => ({
  showId: null,
  showName: '',
  showStatus: 'draft',
  blocks: [],
  currentBlockId: null,
  showStartedAt: null,
  blockStartedAt: null,
  signals: [],
  executionLog: [],
  tally: { program: null, preview: null },
  triggeredElements: new Set<string>(),
  automatorConnected: false,
  automatorMode: 'unknown',
  ws: null,
  wsConnected: false,

  loadShow: async (showId) => {
    const res = await fetch(`/api/shows/${showId}/rundown`);
    if (!res.ok) return;
    const data = await res.json();
    set({
      showId,
      showName: data.show.name,
      showStatus: data.show.status,
      blocks: data.blocks,
      currentBlockId: data.blocks.length > 0 ? data.blocks[0].id : null,
    });
  },

  connectWs: (showId) => {
    const { ws: existingWs } = get();
    if (existingWs) existingWs.close();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', payload: { showId } }));
      set({ wsConnected: true });
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      // Execution events → log + element tracking
      if (msg.channel === 'execution') {
        // Automator presence tracking
        if (msg.type === 'automator_status' || msg.type === 'automator_mode' || msg.type === 'automator_heartbeat') {
          const mode = msg.payload?.mode as 'auto' | 'manual' | undefined;
          set({
            automatorConnected: true,
            ...(mode ? { automatorMode: mode } : {}),
          });
          if (automatorTimeout) clearTimeout(automatorTimeout);
          automatorTimeout = setTimeout(() => {
            set({ automatorConnected: false, automatorMode: 'unknown' });
          }, 10000);
          return;
        }

        if (msg.type === 'show_status_changed') {
          set({ showStatus: msg.payload.status });
          if (msg.payload.status === 'live') {
            set({ showStartedAt: new Date().toISOString() });
          }
          if (msg.payload.status === 'ready') {
            set({ showStartedAt: null, triggeredElements: new Set<string>() });
          }
        }
        if (msg.type === 'cue_ack' && msg.payload?.elementId) {
          set((state) => {
            const next = new Set(state.triggeredElements);
            next.add(msg.payload.elementId);
            return { triggeredElements: next };
          });
        }
        set((state) => ({
          executionLog: [
            { ...msg.payload, type: msg.type, timestamp: msg.timestamp, seq: msg.seq || 0, show_id: showId, idempotency_key: '' },
            ...state.executionLog,
          ].slice(0, 200),
        }));
      }

      // Tally updates
      if (msg.channel === 'tally') {
        set({ tally: msg.payload });
      }

      // Signals
      if (msg.channel === 'signals') {
        if (msg.type === 'signal') {
          set((state) => ({
            signals: [msg.payload, ...state.signals].slice(0, 50),
          }));
        } else if (msg.type === 'signals_cleared') {
          set({ signals: [] });
        }
      }

      // Rundown updates
      if (msg.channel === 'rundown') {
        switch (msg.type) {
          case 'block_created':
            set((state) => ({
              blocks: [...state.blocks, { ...msg.payload.block, elements: [] }],
            }));
            break;
          case 'block_updated':
            set((state) => ({
              blocks: state.blocks.map((b) =>
                b.id === msg.payload.blockId ? { ...b, ...msg.payload.changes } : b
              ),
            }));
            break;
          case 'block_deleted':
            set((state) => ({
              blocks: state.blocks.filter((b) => b.id !== msg.payload.blockId),
            }));
            break;
        }
      }
    };

    ws.onclose = () => set({ wsConnected: false });
    set({ ws });
  },

  disconnectWs: () => {
    const { ws } = get();
    if (automatorTimeout) {
      clearTimeout(automatorTimeout);
      automatorTimeout = null;
    }
    if (ws) {
      ws.close();
      set({ ws: null, wsConnected: false, automatorConnected: false, automatorMode: 'unknown' });
    }
  },

  sendSignal: async (showId, type, value) => {
    await fetch(`/api/shows/${showId}/signals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value }),
    });
  },

  clearSignals: async (showId) => {
    await fetch(`/api/shows/${showId}/signals`, { method: 'DELETE' });
  },

  setCurrentBlock: (blockId) => {
    set({ currentBlockId: blockId, blockStartedAt: new Date().toISOString() });
  },

  // Execution commands
  sendExecutionCommand: (type, payload?) => {
    const { ws } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      channel: 'execution',
      type,
      idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      payload: { ...payload, source: 'go_live' },
    }));
  },

  cueElement: (elementId) => {
    get().sendExecutionCommand('cue', { elementId });
  },

  nextBlock: () => {
    const { blocks, currentBlockId } = get();
    const idx = blocks.findIndex((b) => b.id === currentBlockId);
    if (idx < blocks.length - 1) {
      const nextBlock = blocks[idx + 1];
      get().setCurrentBlock(nextBlock.id);
      get().sendExecutionCommand('next_block', { blockId: nextBlock.id });
    }
  },

  prevBlock: () => {
    const { blocks, currentBlockId } = get();
    const idx = blocks.findIndex((b) => b.id === currentBlockId);
    if (idx > 0) {
      const prevBlock = blocks[idx - 1];
      get().setCurrentBlock(prevBlock.id);
      get().sendExecutionCommand('prev_block', { blockId: prevBlock.id });
    }
  },

  stopShow: async () => {
    const { showId } = get();
    if (!showId) return;
    const res = await fetch(`/api/shows/${showId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready' }),
    });
    if (res.ok) {
      set({ showStatus: 'ready', showStartedAt: null, triggeredElements: new Set<string>() });
    }
  },

  goLive: async () => {
    const { showId } = get();
    if (!showId) return;
    const res = await fetch(`/api/shows/${showId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'live' }),
    });
    if (res.ok) {
      set({ showStatus: 'live', showStartedAt: new Date().toISOString(), triggeredElements: new Set<string>() });
    }
  },

  goReady: async () => {
    const { showId } = get();
    if (!showId) return;
    const res = await fetch(`/api/shows/${showId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready' }),
    });
    if (res.ok) {
      set({ showStatus: 'ready', showStartedAt: null, triggeredElements: new Set<string>() });
    }
  },

  goRehearsal: async () => {
    const { showId } = get();
    if (!showId) return;
    const res = await fetch(`/api/shows/${showId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rehearsal' }),
    });
    if (res.ok) {
      set({ showStatus: 'rehearsal' });
    }
  },
}));
