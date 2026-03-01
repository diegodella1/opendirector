'use client';

import { useCallback } from 'react';
import type { Block, Element, Action } from '@/lib/types';
import { useRundownStore } from '@/stores/rundown-store';
import ActionConfigurator from './ActionConfigurator';

const elementTypeLabels: Record<string, { label: string; color: string }> = {
  clip: { label: 'CLIP', color: 'bg-purple-600' },
  graphic: { label: 'GFX', color: 'bg-green-600' },
  lower_third: { label: 'LT', color: 'bg-yellow-600' },
  audio: { label: 'AUD', color: 'bg-cyan-600' },
  note: { label: 'NOTE', color: 'bg-gray-500' },
};

interface Props {
  showId: string;
  block: Block & { elements: (Element & { actions: Action[] })[] };
  isLive: boolean;
}

export default function InspectorPanel({ showId, block, isLive }: Props) {
  const { selectedElementId, selectElement, updateBlock, updateElement } = useRundownStore();

  const element = selectedElementId
    ? block.elements.find(e => e.id === selectedElementId)
    : null;

  const handleClose = useCallback(() => {
    selectElement(null);
  }, [selectElement]);

  // Element inspector
  if (element) {
    const info = elementTypeLabels[element.type] || { label: '?', color: 'bg-gray-500' };
    return (
      <div className="w-80 bg-od-bg border-l border-od-surface-light flex flex-col shrink-0 overflow-y-auto">
        {/* Header */}
        <div className="p-3 border-b border-od-surface-light">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={`${info.color} text-white text-[10px] px-1.5 py-0.5 rounded font-medium`}>
                {info.label}
              </span>
              <span className="text-white text-sm font-medium truncate">
                {element.title || 'Untitled'}
              </span>
            </div>
            <button
              onClick={handleClose}
              className="text-od-text-dim hover:text-white text-sm transition-colors"
            >
              &times;
            </button>
          </div>
          {element.subtitle && (
            <p className="text-xs text-od-text-dim">{element.subtitle}</p>
          )}
        </div>

        {/* Properties */}
        <div className="p-3 space-y-3 border-b border-od-surface-light">
          <div>
            <label className="text-[10px] text-od-text-dim uppercase block mb-1">Title</label>
            <input
              type="text"
              value={element.title || ''}
              onChange={(e) => updateElement(showId, block.id, element.id, { title: e.target.value || null })}
              disabled={isLive}
              className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white disabled:opacity-40"
            />
          </div>
          <div>
            <label className="text-[10px] text-od-text-dim uppercase block mb-1">Duration (sec)</label>
            <input
              type="number"
              value={element.duration_sec || ''}
              onChange={(e) => updateElement(showId, block.id, element.id, {
                duration_sec: e.target.value ? parseInt(e.target.value) : null,
              })}
              disabled={isLive}
              className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white disabled:opacity-40"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-[10px] text-od-text-dim uppercase block mb-1">vMix Input Key</label>
            <input
              type="text"
              value={element.vmix_input_key || ''}
              onChange={(e) => updateElement(showId, block.id, element.id, {
                vmix_input_key: e.target.value || null,
              })}
              disabled={isLive}
              className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white disabled:opacity-40"
              placeholder="e.g. cam1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-od-text-dim uppercase block mb-1">Trigger</label>
              <select
                value={element.trigger_type}
                onChange={(e) => updateElement(showId, block.id, element.id, {
                  trigger_type: e.target.value as Element['trigger_type'],
                })}
                disabled={isLive}
                className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white disabled:opacity-40"
              >
                <option value="manual">Manual</option>
                <option value="on_cue">On CUE</option>
                <option value="on_block_start">On Block Start</option>
                <option value="timecode">Timecode</option>
                <option value="on_keyword">On Keyword</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-od-text-dim uppercase block mb-1">Mode</label>
              <select
                value={element.mode}
                onChange={(e) => updateElement(showId, block.id, element.id, {
                  mode: e.target.value as Element['mode'],
                })}
                disabled={isLive}
                className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white disabled:opacity-40"
              >
                <option value="fullscreen">Fullscreen</option>
                <option value="overlay">Overlay</option>
                <option value="pip">PiP</option>
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-3 flex-1">
          <ActionConfigurator
            actions={element.actions || []}
            showId={showId}
            blockId={block.id}
            elementId={element.id}
            isLive={isLive}
          />
        </div>
      </div>
    );
  }

  // Block inspector (no element selected)
  return (
    <div className="w-80 bg-od-bg border-l border-od-surface-light flex flex-col shrink-0 overflow-y-auto">
      <div className="p-3 border-b border-od-surface-light">
        <h3 className="text-white text-sm font-medium">{block.name}</h3>
        <span className="text-[10px] text-od-text-dim uppercase">{block.status}</span>
      </div>
      <div className="p-3 space-y-3">
        <div>
          <label className="text-[10px] text-od-text-dim uppercase block mb-1">Est. Duration (sec)</label>
          <input
            type="number"
            value={block.estimated_duration_sec || ''}
            onChange={(e) => updateBlock(showId, block.id, {
              estimated_duration_sec: parseInt(e.target.value) || 0,
            })}
            disabled={isLive}
            className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white disabled:opacity-40"
          />
        </div>
        <div>
          <label className="text-[10px] text-od-text-dim uppercase block mb-1">Cameras</label>
          <input
            type="text"
            value={block.cameras?.join(', ') || ''}
            onChange={(e) => updateBlock(showId, block.id, {
              cameras: e.target.value.split(',').map(c => c.trim()).filter(Boolean),
            })}
            disabled={isLive}
            className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white disabled:opacity-40"
            placeholder="cam1, cam2, cam3"
          />
        </div>
      </div>
      <div className="p-3 text-center text-xs text-od-text-dim">
        Select an element to edit its actions
      </div>
    </div>
  );
}
