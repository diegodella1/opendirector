'use client';

import { create } from 'zustand';
import type { Show, Block, Element, Action, GtTemplate } from '@/lib/types';

interface ElementWithActions extends Element {
  actions: Action[];
}

interface BlockWithElements extends Block {
  elements: ElementWithActions[];
}

interface RedoEntry {
  actionType: string;
  forwardData: Record<string, unknown>;
  reverseData: Record<string, unknown>;
}

interface RundownState {
  // Data
  show: Show | null;
  blocks: BlockWithElements[];
  gtTemplates: GtTemplate[];
  selectedBlockId: string | null;
  selectedElementId: string | null;

  // Undo/Redo
  redoStack: RedoEntry[];

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
  reorderBlocks: (showId: string, order: string[]) => Promise<void>;
  reorderElements: (showId: string, blockId: string, order: string[]) => Promise<void>;
  addAction: (showId: string, blockId: string, elementId: string, action: Partial<Action>) => Promise<void>;
  updateAction: (showId: string, blockId: string, elementId: string, actionId: string, changes: Partial<Action>) => Promise<void>;
  deleteAction: (showId: string, blockId: string, elementId: string, actionId: string) => Promise<void>;
  reorderActions: (showId: string, blockId: string, elementId: string, order: string[]) => Promise<void>;
  undo: (showId: string) => Promise<void>;
  redo: (showId: string) => Promise<void>;
  selectBlock: (blockId: string | null) => void;
  selectElement: (elementId: string | null) => void;
  connectWs: (showId: string) => void;
  disconnectWs: () => void;
}

export const useRundownStore = create<RundownState>((set, get) => ({
  show: null,
  blocks: [],
  gtTemplates: [],
  selectedBlockId: null,
  selectedElementId: null,
  redoStack: [],
  ws: null,
  wsConnected: false,

  loadRundown: async (showId) => {
    const res = await fetch(`/api/shows/${showId}/rundown`);
    if (!res.ok) return;
    const data = await res.json();
    set({ show: data.show, blocks: data.blocks, gtTemplates: data.gt_templates || [] });
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
          ? { ...b, elements: [...b.elements, { ...newElement, actions: newElement.actions || [] }] }
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

  reorderBlocks: async (showId, order) => {
    // Optimistic update
    set((state) => {
      const blockMap = new Map(state.blocks.map((b) => [b.id, b]));
      const reordered = order
        .map((id, idx) => {
          const block = blockMap.get(id);
          return block ? { ...block, position: idx } : null;
        })
        .filter(Boolean) as BlockWithElements[];
      return { blocks: reordered };
    });
    await fetch(`/api/shows/${showId}/blocks/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
  },

  reorderElements: async (showId, blockId, order) => {
    // Optimistic update
    set((state) => ({
      blocks: state.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const elMap = new Map(b.elements.map((e) => [e.id, e]));
        const reordered = order
          .map((id, idx) => {
            const el = elMap.get(id);
            return el ? { ...el, position: idx } : null;
          })
          .filter(Boolean) as ElementWithActions[];
        return { ...b, elements: reordered };
      }),
    }));
    await fetch(`/api/shows/${showId}/blocks/${blockId}/elements/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
  },

  addAction: async (showId, blockId, elementId, action) => {
    const res = await fetch(
      `/api/shows/${showId}/blocks/${blockId}/elements/${elementId}/actions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      }
    );
    if (!res.ok) return;
    const newAction = await res.json();
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              elements: b.elements.map((e) =>
                e.id === elementId
                  ? { ...e, actions: [...e.actions, newAction] }
                  : e
              ),
            }
          : b
      ),
    }));
  },

  updateAction: async (showId, blockId, elementId, actionId, changes) => {
    const res = await fetch(
      `/api/shows/${showId}/blocks/${blockId}/elements/${elementId}/actions/${actionId}`,
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
                e.id === elementId
                  ? { ...e, actions: e.actions.map((a) => a.id === actionId ? { ...a, ...updated } : a) }
                  : e
              ),
            }
          : b
      ),
    }));
  },

  deleteAction: async (showId, blockId, elementId, actionId) => {
    const res = await fetch(
      `/api/shows/${showId}/blocks/${blockId}/elements/${elementId}/actions/${actionId}`,
      {
        method: 'DELETE',
      }
    );
    if (!res.ok) return;
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              elements: b.elements.map((e) =>
                e.id === elementId
                  ? { ...e, actions: e.actions.filter((a) => a.id !== actionId) }
                  : e
              ),
            }
          : b
      ),
    }));
  },

  reorderActions: async (showId, blockId, elementId, order) => {
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              elements: b.elements.map((e) => {
                if (e.id !== elementId) return e;
                const actionMap = new Map(e.actions.map((a) => [a.id, a]));
                const reordered = order
                  .map((id, idx) => {
                    const act = actionMap.get(id);
                    return act ? { ...act, position: idx } : null;
                  })
                  .filter(Boolean) as Action[];
                return { ...e, actions: reordered };
              }),
            }
          : b
      ),
    }));
    await fetch(
      `/api/shows/${showId}/blocks/${blockId}/elements/${elementId}/actions/reorder`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      }
    );
  },

  undo: async (showId) => {
    const res = await fetch(`/api/shows/${showId}/undo`, { method: 'POST' });
    if (!res.ok) return;
    const { actionType, forwardData, reverseData } = await res.json();
    // Push to redo stack
    set((state) => ({
      redoStack: [...state.redoStack, { actionType, forwardData, reverseData }],
    }));
    // Reload rundown to sync state
    get().loadRundown(showId);
  },

  redo: async (showId) => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    const res = await fetch(`/api/shows/${showId}/redo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) return;
    // Pop from redo stack
    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
    }));
    // Reload rundown to sync state
    get().loadRundown(showId);
  },

  selectBlock: (blockId) => set({ selectedBlockId: blockId, selectedElementId: null }),

  selectElement: (elementId) => set({ selectedElementId: elementId }),

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
                  ? { ...b, elements: [...b.elements, { ...msg.payload.element, actions: msg.payload.element.actions || [] }] }
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
          case 'blocks_reordered': {
            const order: string[] = msg.payload.order;
            set((state) => {
              const blockMap = new Map(state.blocks.map((b) => [b.id, b]));
              const reordered = order
                .map((id, idx) => {
                  const block = blockMap.get(id);
                  return block ? { ...block, position: idx } : null;
                })
                .filter(Boolean) as BlockWithElements[];
              return { blocks: reordered };
            });
            break;
          }
          case 'elements_reordered': {
            const { blockId: reorderBlockId, order: elOrder } = msg.payload;
            set((state) => ({
              blocks: state.blocks.map((b) => {
                if (b.id !== reorderBlockId) return b;
                const elMap = new Map(b.elements.map((e) => [e.id, e]));
                const reordered = elOrder
                  .map((id: string, idx: number) => {
                    const el = elMap.get(id);
                    return el ? { ...el, position: idx } : null;
                  })
                  .filter(Boolean);
                return { ...b, elements: reordered };
              }),
            }));
            break;
          }
          case 'action_created':
            set((state) => ({
              blocks: state.blocks.map((b) => ({
                ...b,
                elements: b.elements.map((e) =>
                  e.id === msg.payload.action.element_id
                    ? { ...e, actions: [...e.actions.filter(a => a.id !== msg.payload.action.id), msg.payload.action] }
                    : e
                ),
              })),
            }));
            break;
          case 'action_updated':
            set((state) => ({
              blocks: state.blocks.map((b) => ({
                ...b,
                elements: b.elements.map((e) => ({
                  ...e,
                  actions: e.actions.map((a) =>
                    a.id === msg.payload.actionId ? { ...a, ...msg.payload.changes } : a
                  ),
                })),
              })),
            }));
            break;
          case 'action_deleted':
            set((state) => ({
              blocks: state.blocks.map((b) => ({
                ...b,
                elements: b.elements.map((e) => ({
                  ...e,
                  actions: e.actions.filter((a) => a.id !== msg.payload.actionId),
                })),
              })),
            }));
            break;
          case 'actions_reordered': {
            const { elementId: reorderElId, order: actOrder } = msg.payload;
            set((state) => ({
              blocks: state.blocks.map((b) => ({
                ...b,
                elements: b.elements.map((e) => {
                  if (e.id !== reorderElId) return e;
                  const actMap = new Map(e.actions.map((a) => [a.id, a]));
                  const reordered = actOrder
                    .map((id: string, idx: number) => {
                      const act = actMap.get(id);
                      return act ? { ...act, position: idx } : null;
                    })
                    .filter(Boolean);
                  return { ...e, actions: reordered };
                }),
              })),
            }));
            break;
          }
          case 'gt_template_created':
            set((state) => ({
              gtTemplates: [...state.gtTemplates, msg.payload.gt_template],
            }));
            break;
          case 'gt_template_updated':
            set((state) => ({
              gtTemplates: state.gtTemplates.map((t) =>
                t.id === msg.payload.gt_template.id ? msg.payload.gt_template : t
              ),
            }));
            break;
          case 'gt_template_deleted':
            set((state) => ({
              gtTemplates: state.gtTemplates.filter((t) => t.id !== msg.payload.templateId),
            }));
            break;
        }
      }

      // Handle undo/redo — reload rundown
      if (msg.channel === 'rundown' && (msg.type === 'undo_applied' || msg.type === 'redo_applied')) {
        get().loadRundown(showId);
      }

      // Handle show status changes
      if (msg.channel === 'execution' && msg.type === 'show_status_changed') {
        set((state) => ({
          show: state.show ? { ...state.show, status: msg.payload.status } : null,
        }));
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
