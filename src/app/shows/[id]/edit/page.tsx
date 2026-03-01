'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRundownStore } from '@/stores/rundown-store';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block, Element, Action, GtTemplate } from '@/lib/types';
import MediaBrowser from '@/components/MediaBrowser';
import GtTemplateManager from '@/components/GtTemplateManager';
import InspectorPanel from '@/components/InspectorPanel';
import PeoplePanel from '@/components/PeoplePanel';

// Element type icons/labels
const elementTypeLabels: Record<string, { label: string; color: string }> = {
  clip: { label: 'CLIP', color: 'bg-purple-600' },
  graphic: { label: 'GFX', color: 'bg-green-600' },
  lower_third: { label: 'LT', color: 'bg-yellow-600' },
  audio: { label: 'AUD', color: 'bg-cyan-600' },
  note: { label: 'NOTE', color: 'bg-gray-500' },
};

// Sortable block item
function SortableBlock({
  block,
  idx,
  isSelected,
  isLive,
  onSelect,
  onDelete,
}: {
  block: { id: string; name: string; elements: Element[]; script: string | null };
  idx: number;
  isSelected: boolean;
  isLive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id, disabled: isLive });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`p-3 border-b border-od-surface-light cursor-pointer transition-colors ${
        isSelected
          ? 'bg-od-accent/20 border-l-2 border-l-od-accent'
          : 'hover:bg-od-surface/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isLive && (
            <span
              {...attributes}
              {...listeners}
              className="text-od-text-dim text-xs cursor-grab active:cursor-grabbing select-none px-1"
              onClick={(e) => e.stopPropagation()}
            >
              ⠿
            </span>
          )}
          <span className="text-od-text-dim text-xs font-mono w-6">
            {String(idx + 1).padStart(2, '0')}
          </span>
          <span className="text-white text-sm font-medium truncate">
            {block.name}
          </span>
        </div>
        {!isLive && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-red-400/50 hover:text-red-400 text-xs transition-colors"
          >
            &times;
          </button>
        )}
      </div>
      {block.elements.length > 0 && (
        <div className="flex gap-1 mt-1.5 ml-12">
          {block.elements.map((el) => {
            const info = elementTypeLabels[el.type] || { label: '?', color: 'bg-gray-500' };
            return (
              <span
                key={el.id}
                className={`${info.color} text-white text-[10px] px-1.5 py-0.5 rounded`}
              >
                {info.label}
              </span>
            );
          })}
        </div>
      )}
      {block.script && (
        <p className="text-od-text-dim text-xs mt-1 ml-12 truncate">
          {block.script.substring(0, 50)}...
        </p>
      )}
    </div>
  );
}

// Sortable element item with inline GT fields
function SortableElement({
  el,
  gtTemplates,
  isLive,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
}: {
  el: Element;
  gtTemplates: GtTemplate[];
  isLive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (changes: Partial<Element>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: el.id, disabled: isLive });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const info = elementTypeLabels[el.type] || { label: '?', color: 'bg-gray-500' };
  const showGtPicker = el.type === 'lower_third' || el.type === 'graphic';
  const selectedGt = showGtPicker && el.gt_template_id
    ? gtTemplates.find(t => t.id === el.gt_template_id)
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`p-3 bg-od-surface border rounded-lg cursor-pointer transition-colors ${
        isSelected ? 'border-od-accent bg-od-accent/10' : 'border-od-surface-light hover:border-od-accent/30'
      }`}
    >
      <div className="flex items-center gap-3">
        {!isLive && (
          <span
            {...attributes}
            {...listeners}
            className="text-od-text-dim text-xs cursor-grab active:cursor-grabbing select-none"
          >
            ⠿
          </span>
        )}
        <span className={`${info.color} text-white text-xs px-2 py-0.5 rounded font-medium`}>
          {info.label}
        </span>
        <span className="text-white text-sm flex-1">
          {el.title || 'Untitled'}
        </span>
        {el.subtitle && (
          <span className="text-od-text-dim text-xs">{el.subtitle}</span>
        )}
        {el.duration_sec && (
          <span className="text-od-text-dim text-xs font-mono">{el.duration_sec}s</span>
        )}
        <span className="text-od-text-dim text-xs">{el.trigger_type}</span>
        {!isLive && (
          <button
            onClick={onDelete}
            className="text-red-400/50 hover:text-red-400 text-sm transition-colors"
          >
            &times;
          </button>
        )}
      </div>

      {/* GT Template picker + field inputs */}
      {showGtPicker && gtTemplates.length > 0 && (
        <div className="mt-2 ml-8 space-y-2">
          <select
            value={el.gt_template_id || ''}
            onChange={(e) => {
              const tid = e.target.value || null;
              const gt = tid ? gtTemplates.find(t => t.id === tid) : null;
              // Initialize field values with defaults
              const fieldValues = gt
                ? Object.fromEntries(gt.fields.map(f => [f.name, f.default || '']))
                : null;
              onUpdate({ gt_template_id: tid, gt_field_values: fieldValues });
            }}
            className="px-2 py-1 bg-od-bg-dark border border-od-surface-light rounded text-xs text-white focus:outline-none focus:border-od-accent"
          >
            <option value="">Manual (no GT)</option>
            {gtTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {selectedGt && (
            <div className="flex flex-wrap gap-2">
              {selectedGt.fields.map(field => (
                <div key={field.name} className="flex items-center gap-1">
                  <label className="text-xs text-od-text-dim">{field.label}:</label>
                  <input
                    type="text"
                    defaultValue={el.gt_field_values?.[field.name] || field.default || ''}
                    onBlur={(e) => {
                      const newValues = { ...el.gt_field_values, [field.name]: e.target.value };
                      onUpdate({ gt_field_values: newValues });
                    }}
                    className="px-2 py-0.5 bg-od-bg-dark border border-od-surface-light rounded text-xs text-white w-36 focus:outline-none focus:border-od-accent"
                    placeholder={field.default || field.label}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EditorPage() {
  const params = useParams();
  const showId = params.id as string;

  const {
    show,
    blocks,
    gtTemplates,
    selectedBlockId,
    selectedElementId,
    wsConnected,
    loadRundown,
    addBlock,
    updateBlock,
    deleteBlock,
    addElement,
    updateElement,
    deleteElement,
    reorderBlocks,
    reorderElements,
    undo,
    redo,
    selectBlock,
    selectElement,
    connectWs,
    disconnectWs,
  } = useRundownStore();

  const [newBlockName, setNewBlockName] = useState('');
  const [editingScript, setEditingScript] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    loadRundown(showId);
    connectWs(showId);
    return () => disconnectWs();
  }, [showId, loadRundown, connectWs, disconnectWs]);

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo(showId);
      } else if (
        (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        redo(showId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showId, undo, redo]);

  const handleAddBlock = useCallback(async () => {
    if (!newBlockName.trim()) return;
    await addBlock(showId, newBlockName.trim());
    setNewBlockName('');
  }, [showId, newBlockName, addBlock]);

  const handleSaveScript = useCallback(async (blockId: string) => {
    await updateBlock(showId, blockId, { script: scriptText });
    setEditingScript(null);
  }, [showId, scriptText, updateBlock]);

  const handleAddElement = useCallback(async (blockId: string, type: string) => {
    const titles: Record<string, string> = {
      clip: 'New Clip',
      graphic: 'New Graphic',
      lower_third: 'Lower Third',
      audio: 'Audio Cue',
      note: 'Production Note',
    };
    await addElement(showId, blockId, { type, title: titles[type] || 'New Element' });
  }, [showId, addElement]);

  const handleBlockDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = blocks.findIndex((b) => b.id === active.id);
      const newIdx = blocks.findIndex((b) => b.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const newOrder = [...blocks];
      const [moved] = newOrder.splice(oldIdx, 1);
      newOrder.splice(newIdx, 0, moved);
      reorderBlocks(showId, newOrder.map((b) => b.id));
    },
    [blocks, showId, reorderBlocks]
  );

  const handleElementDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!selectedBlockId) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const selectedBlock = blocks.find((b) => b.id === selectedBlockId);
      if (!selectedBlock) return;
      const els = selectedBlock.elements;
      const oldIdx = els.findIndex((e) => e.id === active.id);
      const newIdx = els.findIndex((e) => e.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const newOrder = [...els];
      const [moved] = newOrder.splice(oldIdx, 1);
      newOrder.splice(newIdx, 0, moved);
      reorderElements(showId, selectedBlockId, newOrder.map((e) => e.id));
    },
    [blocks, selectedBlockId, showId, reorderElements]
  );

  if (!show) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-od-text-dim">Loading show...</p>
      </div>
    );
  }

  const isLive = show.status === 'live';
  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  return (
    <div className="flex flex-col h-screen">
      {/* Top Bar */}
      <header className="bg-od-surface border-b border-od-surface-light px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-od-text-dim hover:text-white transition-colors">
            &larr; Shows
          </Link>
          <h1 className="text-lg font-semibold text-white">{show.name}</h1>
          <span className={`text-xs uppercase px-2 py-0.5 rounded font-bold ${
            isLive ? 'bg-od-tally-pgm text-white animate-pulse' :
            show.status === 'rehearsal' ? 'bg-od-warning text-black' :
            'bg-od-surface-light text-od-text-dim'
          }`}>
            {show.status}
          </span>
          <span className="text-xs text-od-text-dim">v{show.version}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded ${wsConnected ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400'}`}>
            {wsConnected ? 'WS Connected' : 'WS Disconnected'}
          </span>
          <Link
            href={`/shows/${showId}/live`}
            className="text-sm px-3 py-1 bg-od-tally-pgm/20 text-od-tally-pgm rounded hover:bg-od-tally-pgm/30 transition-colors font-medium"
          >
            Go Live
          </Link>
          <Link
            href={`/shows/${showId}/prompter`}
            className="text-sm px-3 py-1 bg-od-surface-light rounded hover:bg-od-accent/30 transition-colors"
            target="_blank"
          >
            Prompter
          </Link>
        </div>
      </header>

      {/* Live mode banner */}
      {isLive && (
        <div className="bg-od-tally-pgm/90 text-white px-4 py-2 text-sm font-medium flex items-center gap-3 shrink-0">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          LIVE — Only scripts and notes can be edited. Structural changes are locked.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Blocks/Rundown */}
        <div className="w-80 bg-od-bg border-r border-od-surface-light flex flex-col shrink-0">
          {/* Add Block */}
          <div className="p-3 border-b border-od-surface-light">
            <div className="flex gap-2">
              <input
                type="text"
                value={newBlockName}
                onChange={(e) => setNewBlockName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isLive && handleAddBlock()}
                placeholder={isLive ? 'Locked — show is live' : 'New block...'}
                disabled={isLive}
                className="flex-1 px-3 py-1.5 bg-od-surface border border-od-surface-light rounded text-sm text-white placeholder-od-text-dim focus:outline-none focus:border-od-accent disabled:opacity-40"
              />
              <button
                onClick={handleAddBlock}
                disabled={isLive}
                className="px-3 py-1.5 bg-od-accent text-white rounded text-sm hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>

          {/* Block List with DnD */}
          <div className="flex-1 overflow-y-auto">
            {blocks.length === 0 ? (
              <p className="text-od-text-dim text-sm p-4 text-center">
                No blocks yet. Add one above.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleBlockDragEnd}
              >
                <SortableContext
                  items={blocks.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {blocks.map((block, idx) => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      idx={idx}
                      isSelected={selectedBlockId === block.id}
                      isLive={isLive}
                      onSelect={() => selectBlock(block.id)}
                      onDelete={() => deleteBlock(showId, block.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* Right Panel — Block Detail / Script Editor */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedBlock ? (
            <div className="flex items-center justify-center h-full text-od-text-dim">
              <p>Select a block to edit</p>
            </div>
          ) : (
            <div>
              {/* Block Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">
                  {selectedBlock.name}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-od-text-dim uppercase">
                    {selectedBlock.status}
                  </span>
                </div>
              </div>

              {/* Script Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-od-text-dim uppercase tracking-wider">
                    Script (Teleprompter)
                  </h3>
                  {editingScript === selectedBlock.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveScript(selectedBlock.id)}
                        className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-500 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingScript(null)}
                        className="text-xs px-3 py-1 bg-od-surface-light text-od-text rounded hover:bg-od-surface-light/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingScript(selectedBlock.id);
                        setScriptText(selectedBlock.script || '');
                      }}
                      className="text-xs px-3 py-1 bg-od-surface-light text-od-text rounded hover:bg-od-accent/30 transition-colors"
                    >
                      Edit Script
                    </button>
                  )}
                </div>
                {editingScript === selectedBlock.id ? (
                  <textarea
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    className="w-full h-48 p-3 bg-od-bg-dark border border-od-surface-light rounded-lg text-white font-mono text-sm resize-y focus:outline-none focus:border-od-accent"
                    placeholder="Write the teleprompter script here...&#10;&#10;[PAUSA] for visual pause&#10;[VTR: name] for video&#10;**bold** for emphasis&#10;(instruction) for notes"
                  />
                ) : (
                  <div className="p-3 bg-od-bg-dark border border-od-surface-light rounded-lg min-h-[6rem]">
                    {selectedBlock.script ? (
                      <pre className="text-sm text-od-text whitespace-pre-wrap font-mono">
                        {selectedBlock.script}
                      </pre>
                    ) : (
                      <p className="text-od-text-dim text-sm italic">
                        No script yet. Click &quot;Edit Script&quot; to add one.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Elements Section with DnD */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-od-text-dim uppercase tracking-wider">
                    Elements
                  </h3>
                  <div className="flex gap-1">
                    {Object.entries(elementTypeLabels).map(([type, info]) => (
                      <button
                        key={type}
                        onClick={() => handleAddElement(selectedBlock.id, type)}
                        disabled={isLive}
                        className={`${info.color} text-white text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        + {info.label}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedBlock.elements.length === 0 ? (
                  <div className="p-4 bg-od-bg-dark border border-od-surface-light rounded-lg text-center">
                    <p className="text-od-text-dim text-sm">
                      No elements. Add clips, graphics, lower thirds, audio cues, or notes.
                    </p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleElementDragEnd}
                  >
                    <SortableContext
                      items={selectedBlock.elements.map((e) => e.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {selectedBlock.elements.map((el) => (
                          <SortableElement
                            key={el.id}
                            el={el}
                            gtTemplates={gtTemplates}
                            isLive={isLive}
                            isSelected={selectedElementId === el.id}
                            onSelect={() => selectElement(el.id)}
                            onDelete={() => deleteElement(showId, selectedBlock.id, el.id)}
                            onUpdate={(changes) => updateElement(showId, selectedBlock.id, el.id, changes)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>

              {/* GT Templates Section */}
              <div className="mt-6">
                <GtTemplateManager
                  showId={showId}
                  templates={gtTemplates}
                  onCreated={() => loadRundown(showId)}
                  onUpdated={() => loadRundown(showId)}
                  onDeleted={() => loadRundown(showId)}
                />
              </div>

              {/* People Section */}
              <div className="mt-6">
                <PeoplePanel showId={showId} />
              </div>

              {/* Media Section */}
              <div className="mt-6">
                <MediaBrowser showId={showId} />
              </div>

              {/* Notes Section */}
              <div className="mt-6">
                <h3 className="text-sm font-medium text-od-text-dim uppercase tracking-wider mb-2">
                  Production Notes
                </h3>
                <textarea
                  value={selectedBlock.notes || ''}
                  onChange={(e) => updateBlock(showId, selectedBlock.id, { notes: e.target.value })}
                  className="w-full h-24 p-3 bg-od-bg-dark border border-od-surface-light rounded-lg text-od-text-dim text-sm resize-y focus:outline-none focus:border-od-accent"
                  placeholder="Internal notes (not shown to talent)..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Panel — Inspector */}
        {selectedBlock && (
          <InspectorPanel
            showId={showId}
            block={selectedBlock as Block & { elements: (Element & { actions: Action[] })[] }}
            isLive={isLive}
          />
        )}
      </div>
    </div>
  );
}
