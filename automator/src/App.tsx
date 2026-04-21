import { useEffect, useCallback } from 'react';
import { useAutomatorStore, useActiveShowState } from '@/stores/automator-store';
import { listenEvent } from '@/lib/tauri-api';
import { ConnectionScreen } from '@/components/ConnectionScreen';
import { TabBar } from '@/components/TabBar';
import { StatusBar } from '@/components/StatusBar';
import { RundownPanel } from '@/components/RundownPanel';
import { TallyPanel } from '@/components/TallyPanel';
import { ExecutionLog } from '@/components/ExecutionLog';
import { ControlBar } from '@/components/ControlBar';
import { MediaSyncPanel } from '@/components/MediaSyncPanel';
import { PreflightPanel } from '@/components/PreflightPanel';
import { AutomatorUpdatePrompt } from '@/components/AutomatorUpdatePrompt';

export default function App() {
  const tabs = useAutomatorStore(s => s.tabs);
  const { show, blocks, currentBlockIdx, selectedElementId } = useActiveShowState();
  const { cueElement, executeStep, nextBlock, prevBlock, selectElement, stopShow, resetShow, toggleRehearsal, panicCut } = useAutomatorStore();

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        nextBlock();
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedElementId) cueElement(selectedElementId);
        break;
      case 'Escape':
        e.preventDefault();
        stopShow();
        break;
      case 'F12':
        e.preventDefault();
        panicCut();
        break;
      case 'Backspace':
        e.preventDefault();
        prevBlock();
        break;
      case 'ArrowDown': {
        e.preventDefault();
        const block = blocks[currentBlockIdx];
        if (!block) break;
        const elems = block.elements;
        if (!selectedElementId) {
          if (elems.length > 0) selectElement(elems[0].id);
        } else {
          const idx = elems.findIndex(el => el.id === selectedElementId);
          if (idx < elems.length - 1) selectElement(elems[idx + 1].id);
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const block2 = blocks[currentBlockIdx];
        if (!block2) break;
        const elems2 = block2.elements;
        if (selectedElementId) {
          const idx2 = elems2.findIndex(el => el.id === selectedElementId);
          if (idx2 > 0) selectElement(elems2[idx2 - 1].id);
          else selectElement(null);
        }
        break;
      }
      case 'r':
      case 'R':
        e.preventDefault();
        if (e.ctrlKey) {
          toggleRehearsal();
        } else {
          resetShow();
        }
        break;
      case 'F1': case 'F2': case 'F3': case 'F4':
      case 'F5': case 'F6': case 'F7': case 'F8': {
        e.preventDefault();
        if (!selectedElementId) break;
        for (const block of blocks) {
          for (const el of block.elements) {
            if (el.id === selectedElementId) {
              const stepAction = el.actions.find(a => a.phase === 'step' && a.step_hotkey === e.key);
              if (stepAction?.step_label) {
                executeStep(selectedElementId, stepAction.step_label);
              }
            }
          }
        }
        break;
      }
    }
  }, [blocks, currentBlockIdx, selectedElementId, nextBlock, prevBlock, cueElement, executeStep, selectElement, stopShow, resetShow, toggleRehearsal, panicCut]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Media sync event listeners
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setupListeners = async () => {
      unlisteners.push(await listenEvent('media-progress', (payload: unknown) => {
        const p = payload as { id: string; progress: number };
        useAutomatorStore.getState().updateMediaProgress(p.id, p.progress);
      }));

      unlisteners.push(await listenEvent('media-sync-complete', (payload: unknown) => {
        const p = payload as { id: string; local_path: string };
        useAutomatorStore.getState().markMediaSynced(p.id, p.local_path);
      }));

      unlisteners.push(await listenEvent('media-sync-error', (payload: unknown) => {
        const p = payload as { id: string; error: string };
        useAutomatorStore.getState().markMediaError(p.id, p.error);
      }));

      unlisteners.push(await listenEvent('vmix-recording', (payload: unknown) => {
        const recording = payload as boolean;
        const state = useAutomatorStore.getState();
        useAutomatorStore.setState({
          tally: { ...state.tally, recording },
        });
        // Broadcast to WS for Go Live
        const tab = state.activeTabId ? state.tabs.get(state.activeTabId) : null;
        const ws = tab?.ws;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ channel: 'tally', type: 'tally_update', timestamp: new Date().toISOString(), payload: { ...state.tally, recording } }));
        }
      }));

      unlisteners.push(await listenEvent('vmix-streaming', (payload: unknown) => {
        const streaming = payload as boolean;
        const state = useAutomatorStore.getState();
        useAutomatorStore.setState({
          tally: { ...state.tally, streaming },
        });
        const tab = state.activeTabId ? state.tabs.get(state.activeTabId) : null;
        const ws = tab?.ws;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ channel: 'tally', type: 'tally_update', timestamp: new Date().toISOString(), payload: { ...state.tally, streaming } }));
        }
      }));

      unlisteners.push(await listenEvent('ws-media', (payload: unknown) => {
        try {
          const msg = JSON.parse(payload as string);
          const state = useAutomatorStore.getState();
          if (state.activeTabId) {
            state.handleWsMessage(state.activeTabId, msg);
          }
        } catch { /* ignore */ }
      }));
    };

    setupListeners();
    return () => { unlisteners.forEach(fn => fn()); };
  }, []);

  if (tabs.size === 0) {
    return (
      <div className="flex flex-col h-screen bg-od-bg">
        <AutomatorUpdatePrompt />
        <div className="flex-1 min-h-0">
          <ConnectionScreen />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-od-bg">
      <AutomatorUpdatePrompt />
      <StatusBar />
      <TabBar />
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden">
          <RundownPanel />
        </div>
        <MediaSyncPanel />
      </div>
      <PreflightPanel />
      <div className="flex border-t border-od-surface-light" style={{ height: '180px' }}>
        <TallyPanel />
        <ExecutionLog />
      </div>
      <ControlBar />
    </div>
  );
}
