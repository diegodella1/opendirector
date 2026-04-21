'use client';

import { useState } from 'react';
import { appPath } from '@/lib/app-path';
import type { GtTemplate, GtTemplateField } from '@/lib/types';

interface GtTemplateManagerProps {
  showId: string;
  templates: GtTemplate[];
  onCreated: (template: GtTemplate) => void;
  onUpdated: (template: GtTemplate) => void;
  onDeleted: (templateId: string) => void;
}

export default function GtTemplateManager({
  showId,
  templates,
  onCreated,
  onUpdated,
  onDeleted,
}: GtTemplateManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [vmixInputKey, setVmixInputKey] = useState('');
  const [overlayNumber, setOverlayNumber] = useState(2);
  const [fields, setFields] = useState<GtTemplateField[]>([]);

  const resetForm = () => {
    setName('');
    setVmixInputKey('');
    setOverlayNumber(2);
    setFields([]);
    setCreating(false);
    setEditingId(null);
  };

  const startEdit = (t: GtTemplate) => {
    setEditingId(t.id);
    setName(t.name);
    setVmixInputKey(t.vmix_input_key);
    setOverlayNumber(t.overlay_number);
    setFields([...t.fields]);
    setCreating(false);
  };

  const startCreate = () => {
    resetForm();
    setCreating(true);
  };

  const addField = () => {
    setFields([...fields, { name: '', label: '' }]);
  };

  const updateField = (idx: number, key: keyof GtTemplateField, value: string) => {
    setFields(fields.map((f, i) => (i === idx ? { ...f, [key]: value } : f)));
  };

  const removeField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name.trim() || !vmixInputKey.trim()) return;

    const payload = {
      name: name.trim(),
      vmix_input_key: vmixInputKey.trim(),
      overlay_number: overlayNumber,
      fields: fields.filter((f) => f.name.trim()),
    };

    if (editingId) {
      const res = await fetch(appPath(`/api/shows/${showId}/gt-templates/${editingId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdated(updated);
        resetForm();
      }
    } else {
      const res = await fetch(appPath(`/api/shows/${showId}/gt-templates`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        onCreated(created);
        resetForm();
      }
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(appPath(`/api/shows/${showId}/gt-templates/${id}`), {
      method: 'DELETE',
    });
    if (res.ok) {
      onDeleted(id);
      if (editingId === id) resetForm();
    }
  };

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-od-text-dim uppercase tracking-wider hover:text-white transition-colors"
      >
        <span className="text-xs">{expanded ? '&#9660;' : '&#9654;'}</span>
        GT Templates ({templates.length})
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {/* Existing templates */}
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-2 bg-od-surface border border-od-surface-light rounded"
            >
              <div>
                <span className="text-sm text-white font-medium">{t.name}</span>
                <span className="text-xs text-od-text-dim ml-2">
                  Input: {t.vmix_input_key} | OVL {t.overlay_number} | {t.fields.length} fields
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => startEdit(t)}
                  className="text-xs px-2 py-1 text-od-text-dim hover:text-white transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-xs px-2 py-1 text-red-400/50 hover:text-red-400 transition-colors"
                >
                  Del
                </button>
              </div>
            </div>
          ))}

          {/* Create/Edit form */}
          {(creating || editingId) && (
            <div className="p-3 bg-od-bg-dark border border-od-surface-light rounded-lg space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Template name"
                  className="col-span-1 px-2 py-1.5 bg-od-surface border border-od-surface-light rounded text-sm text-white placeholder-od-text-dim focus:outline-none focus:border-od-accent"
                />
                <input
                  value={vmixInputKey}
                  onChange={(e) => setVmixInputKey(e.target.value)}
                  placeholder="vMix Input Key"
                  className="col-span-1 px-2 py-1.5 bg-od-surface border border-od-surface-light rounded text-sm text-white placeholder-od-text-dim focus:outline-none focus:border-od-accent"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-od-text-dim">OVL</label>
                  <input
                    type="number"
                    value={overlayNumber}
                    onChange={(e) => setOverlayNumber(Number(e.target.value))}
                    min={1}
                    max={4}
                    className="w-14 px-2 py-1.5 bg-od-surface border border-od-surface-light rounded text-sm text-white text-center focus:outline-none focus:border-od-accent"
                  />
                </div>
              </div>

              {/* Fields */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-od-text-dim uppercase">Fields (SetText targets)</span>
                  <button
                    onClick={addField}
                    className="text-xs px-2 py-0.5 bg-od-surface-light text-od-text rounded hover:bg-od-accent/30 transition-colors"
                  >
                    + Field
                  </button>
                </div>
                {fields.map((f, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input
                      value={f.name}
                      onChange={(e) => updateField(i, 'name', e.target.value)}
                      placeholder="Headline.Text"
                      className="flex-1 px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white placeholder-od-text-dim focus:outline-none focus:border-od-accent"
                    />
                    <input
                      value={f.label}
                      onChange={(e) => updateField(i, 'label', e.target.value)}
                      placeholder="Label (e.g. Nombre)"
                      className="flex-1 px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white placeholder-od-text-dim focus:outline-none focus:border-od-accent"
                    />
                    <button
                      onClick={() => removeField(i)}
                      className="text-red-400/50 hover:text-red-400 text-xs px-1"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={resetForm}
                  className="text-xs px-3 py-1 bg-od-surface-light text-od-text rounded hover:bg-od-surface-light/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="text-xs px-3 py-1 bg-od-accent text-white rounded hover:bg-blue-500 transition-colors"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          )}

          {!creating && !editingId && (
            <button
              onClick={startCreate}
              className="w-full text-xs py-2 border border-dashed border-od-surface-light rounded text-od-text-dim hover:border-od-accent hover:text-white transition-colors"
            >
              + New GT Template
            </button>
          )}
        </div>
      )}
    </div>
  );
}
