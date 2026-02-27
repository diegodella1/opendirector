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

  // Actions
  loadShow: (showId: string) => Promise<void>;
  connectWs: (showId: string) => void;
  disconnectWs: () => void;
  sendSignal: (showId: string, type: string, value?: string) => Promise<void>;
  clearSignals: (showId: string) => Promise<void>;
  setCurrentBlock: (blockId: string | null) => void;
}

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

      // Execution events → log
      if (msg.channel === 'execution') {
        if (msg.type === 'show_status_changed') {
          set({ showStatus: msg.payload.status });
          if (msg.payload.status === 'live') {
            set({ showStartedAt: new Date().toISOString() });
          }
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
    if (ws) {
      ws.close();
      set({ ws: null, wsConnected: false });
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
}));
