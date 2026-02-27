'use client';

import { create } from 'zustand';
import type { Show, Block, Element } from '@/lib/types';

interface BlockWithElements extends Block {
  elements: Element[];
}

interface RundownState {
  // Data
  show: Show | null;
  blocks: BlockWithElements[];
  selectedBlockId: string | null;

  // WebSocket
  ws: WebSocket | null;
  wsConnected: boolean;

  // Actions
  loadRundown: (showId: string) => Promise<void>;
  addBlock: (showId: string, name: string) => Promise<void>;
  updateBlock: (showId: string, blockId: string, changes: Partial<Block>) => Promise<void>;
  deleteBlock: (showId: string, blockId: string) => Promise<void>;
  addElement: (showId: string, blockId: string, element: { type: string; title?: string; subtitle?: string }) => Promise<void>;
  updateElement: (showId: string, blockId: string, elementId: string, changes: Partial<Element>) => Promise<void>;
  deleteElement: (showId: string, blockId: string, elementId: string) => Promise<void>;
  selectBlock: (blockId: string | null) => void;
  connectWs: (showId: string) => void;
  disconnectWs: () => void;
}

export const useRundownStore = create<RundownState>((set, get) => ({
  show: null,
  blocks: [],
  selectedBlockId: null,
  ws: null,
  wsConnected: false,

  loadRundown: async (showId) => {
    const res = await fetch(`/api/shows/${showId}/rundown`);
    if (!res.ok) return;
    const data = await res.json();
    set({ show: data.show, blocks: data.blocks });
  },

  addBlock: async (showId, name) => {
    const res = await fetch(`/api/shows/${showId}/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const block = await res.json();
    set((state) => ({
      blocks: [...state.blocks, { ...block, elements: [] }],
    }));
  },

  updateBlock: async (showId, blockId, changes) => {
    const res = await fetch(`/api/shows/${showId}/blocks/${blockId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!res.ok) return;
    const updated = await res.json();
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === blockId ? { ...b, ...updated } : b
      ),
    }));
  },

  deleteBlock: async (showId, blockId) => {
    const res = await fetch(`/api/shows/${showId}/blocks/${blockId}`, {
      method: 'DELETE',
    });
    if (!res.ok) return;
    set((state) => ({
      blocks: state.blocks.filter((b) => b.id !== blockId),
      selectedBlockId:
        state.selectedBlockId === blockId ? null : state.selectedBlockId,
    }));
  },

  addElement: async (showId, blockId, element) => {
    const res = await fetch(
      `/api/shows/${showId}/blocks/${blockId}/elements`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(element),
      }
    );
    if (!res.ok) return;
    const newElement = await res.json();
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === blockId
          ? { ...b, elements: [...b.elements, newElement] }
          : b
      ),
    }));
  },

  updateElement: async (showId, blockId, elementId, changes) => {
    const res = await fetch(
      `/api/shows/${showId}/blocks/${blockId}/elements/${elementId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      }
    );
    if (!res.ok) return;
    const updated = await res.json();
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              elements: b.elements.map((e) =>
                e.id === elementId ? { ...e, ...updated } : e
              ),
            }
          : b
      ),
    }));
  },

  deleteElement: async (showId, blockId, elementId) => {
    const res = await fetch(
      `/api/shows/${showId}/blocks/${blockId}/elements/${elementId}`,
      {
        method: 'DELETE',
      }
    );
    if (!res.ok) return;
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === blockId
          ? { ...b, elements: b.elements.filter((e) => e.id !== elementId) }
          : b
      ),
    }));
  },

  selectBlock: (blockId) => set({ selectedBlockId: blockId }),

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

      if (msg.channel === 'rundown') {
        switch (msg.type) {
          case 'block_created':
            set((state) => {
              const exists = state.blocks.some(b => b.id === msg.payload.block.id);
              if (exists) return state;
              return {
                blocks: [...state.blocks, { ...msg.payload.block, elements: [] }],
              };
            });
            break;
          case 'block_updated':
            set((state) => ({
              blocks: state.blocks.map((b) =>
                b.id === msg.payload.blockId
                  ? { ...b, ...msg.payload.changes }
                  : b
              ),
            }));
            break;
          case 'block_deleted':
            set((state) => ({
              blocks: state.blocks.filter((b) => b.id !== msg.payload.blockId),
            }));
            break;
          case 'element_created':
            set((state) => ({
              blocks: state.blocks.map((b) =>
                b.id === msg.payload.element.block_id
                  ? { ...b, elements: [...b.elements, msg.payload.element] }
                  : b
              ),
            }));
            break;
          case 'element_updated':
            set((state) => ({
              blocks: state.blocks.map((b) => ({
                ...b,
                elements: b.elements.map((e) =>
                  e.id === msg.payload.elementId
                    ? { ...e, ...msg.payload.changes }
                    : e
                ),
              })),
            }));
            break;
          case 'element_deleted':
            set((state) => ({
              blocks: state.blocks.map((b) =>
                b.id === msg.payload.blockId
                  ? { ...b, elements: b.elements.filter((e) => e.id !== msg.payload.elementId) }
                  : b
              ),
            }));
            break;
        }
      }
    };

    ws.onclose = () => {
      set({ wsConnected: false });
    };

    set({ ws });
  },

  disconnectWs: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null, wsConnected: false });
    }
  },
}));
