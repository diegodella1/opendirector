'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Action } from '@/lib/types';
import { useRundownStore } from '@/stores/rundown-store';

const VMIX_FUNCTIONS = [
  'CutDirect',
  'Merge',
  'FadeToBlack',
  'Play',
  'Pause',
  'PlayPause',
  'Restart',
  'OverlayInput1In',
  'OverlayInput1Out',
  'OverlayInput2In',
  'OverlayInput2Out',
  'OverlayInput3In',
  'OverlayInput3Out',
  'OverlayInput4In',
  'OverlayInput4Out',
  'SetText',
  'Stinger1',
  'Stinger2',
  'AudioOn',
  'AudioOff',
  'AudioBusOn',
  'AudioBusOff',
];

const TARGET_VARS = [
  { label: '{{clip_pool}}', desc: 'Active clip pool' },
  { label: '{{clip_pool_a}}', desc: 'Clip Pool A' },
  { label: '{{clip_pool_b}}', desc: 'Clip Pool B' },
  { label: '{{graphic}}', desc: 'Graphic input' },
  { label: '{{lower_third}}', desc: 'Lower Third input' },
];

const PHASE_OPTIONS = [
  { value: 'on_cue', label: 'On CUE' },
  { value: 'step', label: 'Step' },
  { value: 'timecode', label: 'Timecode' },
  { value: 'on_exit', label: 'On Exit' },
];

const STEP_COLORS = ['green', 'red', 'blue', 'yellow'];
const STEP_HOTKEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

interface Props {
  actions: Action[];
  showId: string;
  blockId: string;
  elementId: string;
  isLive: boolean;
}

function SortableActionRow({
  action,
  isLive,
  editingId,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  editDraft,
  setEditDraft,
}: {
  action: Action;
  isLive: boolean;
  editingId: string | null;
  onEdit: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  editDraft: Partial<Action>;
  setEditDraft: (d: Partial<Action>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: action.id, disabled: isLive });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isEditing = editingId === action.id;
  const phaseLabel = PHASE_OPTIONS.find(p => p.value === action.phase)?.label || action.phase;

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="p-3 bg-od-bg-dark border border-od-accent rounded space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-od-text-dim uppercase">Phase</label>
            <select
              value={editDraft.phase || action.phase}
              onChange={(e) => setEditDraft({ ...editDraft, phase: e.target.value as Action['phase'] })}
              className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
            >
              {PHASE_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-od-text-dim uppercase">vMix Function</label>
            <select
              value={editDraft.vmix_function ?? action.vmix_function}
              onChange={(e) => setEditDraft({ ...editDraft, vmix_function: e.target.value })}
              className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
            >
              {VMIX_FUNCTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              {!VMIX_FUNCTIONS.includes(editDraft.vmix_function ?? action.vmix_function) && (
                <option value={editDraft.vmix_function ?? action.vmix_function}>
                  {editDraft.vmix_function ?? action.vmix_function}
                </option>
              )}
            </select>
            <input
              type="text"
              value={editDraft.vmix_function ?? action.vmix_function}
              onChange={(e) => setEditDraft({ ...editDraft, vmix_function: e.target.value })}
              placeholder="Or type custom..."
              className="w-full mt-1 px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-od-text-dim uppercase">Target Input</label>
            <input
              type="text"
              value={editDraft.target ?? action.target ?? ''}
              onChange={(e) => setEditDraft({ ...editDraft, target: e.target.value || null })}
              placeholder="Input key or {{var}}"
              className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
              list="target-vars"
            />
            <datalist id="target-vars">
              {TARGET_VARS.map(v => <option key={v.label} value={v.label}>{v.desc}</option>)}
            </datalist>
          </div>
          <div>
            <label className="text-[10px] text-od-text-dim uppercase">Field</label>
            <input
              type="text"
              value={editDraft.field ?? action.field ?? ''}
              onChange={(e) => setEditDraft({ ...editDraft, field: e.target.value || null })}
              placeholder="e.g. Headline.Text"
              className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-od-text-dim uppercase">Value</label>
            <input
              type="text"
              value={editDraft.value ?? action.value ?? ''}
              onChange={(e) => setEditDraft({ ...editDraft, value: e.target.value || null })}
              placeholder="Text value"
              className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-od-text-dim uppercase">Delay (ms)</label>
            <input
              type="number"
              value={editDraft.delay_ms ?? action.delay_ms}
              onChange={(e) => setEditDraft({ ...editDraft, delay_ms: parseInt(e.target.value) || 0 })}
              className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
            />
          </div>
          {(editDraft.phase || action.phase) === 'step' && (
            <>
              <div>
                <label className="text-[10px] text-od-text-dim uppercase">Step Label</label>
                <input
                  type="text"
                  value={editDraft.step_label ?? action.step_label ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, step_label: e.target.value || null })}
                  className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-od-text-dim uppercase">Color</label>
                  <select
                    value={editDraft.step_color ?? action.step_color ?? 'green'}
                    onChange={(e) => setEditDraft({ ...editDraft, step_color: e.target.value })}
                    className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
                  >
                    {STEP_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-od-text-dim uppercase">Hotkey</label>
                  <select
                    value={editDraft.step_hotkey ?? action.step_hotkey ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, step_hotkey: e.target.value || null })}
                    className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
                  >
                    <option value="">None</option>
                    {STEP_HOTKEYS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="px-3 py-1 text-xs text-od-text-dim hover:text-white">
            Cancel
          </button>
          <button onClick={onSave} className="px-3 py-1 text-xs bg-od-accent text-white rounded hover:bg-blue-500">
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => !isLive && onEdit(action.id)}
      className="p-2 bg-od-bg-dark border border-od-surface-light rounded flex items-center gap-2 cursor-pointer hover:border-od-accent/50 transition-colors group"
    >
      {!isLive && (
        <span
          {...attributes}
          {...listeners}
          className="text-od-text-dim text-xs cursor-grab active:cursor-grabbing select-none"
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </span>
      )}
      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-od-surface-light text-od-text-dim font-medium">
        {phaseLabel}
      </span>
      <span className="text-xs text-white font-medium">{action.vmix_function}</span>
      {action.target && (
        <span className="text-xs text-od-text-dim">{action.target}</span>
      )}
      {action.field && (
        <span className="text-xs text-od-text-dim">[{action.field}]</span>
      )}
      {action.delay_ms > 0 && (
        <span className="text-[10px] text-od-text-dim font-mono">{action.delay_ms}ms</span>
      )}
      {action.phase === 'step' && action.step_label && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${
          action.step_color === 'red' ? 'bg-red-600' :
          action.step_color === 'blue' ? 'bg-blue-600' :
          action.step_color === 'yellow' ? 'bg-yellow-600' :
          'bg-green-600'
        }`}>
          {action.step_label}{action.step_hotkey ? ` (${action.step_hotkey})` : ''}
        </span>
      )}
      <div className="ml-auto">
        {!isLive && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(action.id); }}
            className="text-red-400/50 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}

export default function ActionConfigurator({ actions, showId, blockId, elementId, isLive }: Props) {
  const { addAction, updateAction, deleteAction, reorderActions } = useRundownStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Action>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleAdd = useCallback(() => {
    addAction(showId, blockId, elementId, {
      phase: 'on_cue',
      vmix_function: 'CutDirect',
      delay_ms: 0,
    });
  }, [showId, blockId, elementId, addAction]);

  const handleEdit = useCallback((id: string) => {
    const action = actions.find(a => a.id === id);
    if (action) {
      setEditingId(id);
      setEditDraft({});
    }
  }, [actions]);

  const handleSave = useCallback(() => {
    if (!editingId) return;
    const changes = { ...editDraft };
    if (Object.keys(changes).length > 0) {
      updateAction(showId, blockId, elementId, editingId, changes);
    }
    setEditingId(null);
    setEditDraft({});
  }, [editingId, editDraft, showId, blockId, elementId, updateAction]);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditDraft({});
  }, []);

  const handleDelete = useCallback((actionId: string) => {
    deleteAction(showId, blockId, elementId, actionId);
  }, [showId, blockId, elementId, deleteAction]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = actions.findIndex(a => a.id === active.id);
    const newIdx = actions.findIndex(a => a.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const newOrder = [...actions];
    const [moved] = newOrder.splice(oldIdx, 1);
    newOrder.splice(newIdx, 0, moved);
    reorderActions(showId, blockId, elementId, newOrder.map(a => a.id));
  }, [actions, showId, blockId, elementId, reorderActions]);

  const sorted = [...actions].sort((a, b) => a.position - b.position);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-od-text-dim uppercase tracking-wider">
          Actions ({sorted.length})
        </h4>
        {!isLive && (
          <button
            onClick={handleAdd}
            className="text-xs px-2 py-1 bg-od-accent text-white rounded hover:bg-blue-500 transition-colors"
          >
            + Add Action
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="text-xs text-od-text-dim italic p-2">
          No actions. Add one to define what happens on CUE.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map(a => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {sorted.map(action => (
                <SortableActionRow
                  key={action.id}
                  action={action}
                  isLive={isLive}
                  editingId={editingId}
                  onEdit={handleEdit}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  onDelete={handleDelete}
                  editDraft={editDraft}
                  setEditDraft={setEditDraft}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
