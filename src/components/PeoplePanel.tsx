'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Person } from '@/lib/types';

interface Props {
  showId: string;
}

export default function PeoplePanel({ showId }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadPeople = useCallback(async () => {
    const res = await fetch(`/api/shows/${showId}/people`);
    if (res.ok) {
      setPeople(await res.json());
    }
  }, [showId]);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const handleAdd = useCallback(async () => {
    const res = await fetch(`/api/shows/${showId}/people`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Person' }),
    });
    if (res.ok) {
      const person = await res.json();
      setPeople(prev => [...prev, person]);
      setEditingId(person.id);
    }
  }, [showId]);

  const handleUpdate = useCallback(async (personId: string, changes: Partial<Person>) => {
    const res = await fetch(`/api/shows/${showId}/people/${personId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (res.ok) {
      const updated = await res.json();
      setPeople(prev => prev.map(p => p.id === personId ? { ...p, ...updated } : p));
    }
  }, [showId]);

  const handleDelete = useCallback(async (personId: string) => {
    const res = await fetch(`/api/shows/${showId}/people/${personId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setPeople(prev => prev.filter(p => p.id !== personId));
    }
  }, [showId]);

  return (
    <div className="border border-od-surface-light rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 bg-od-surface hover:bg-od-surface-light/50 transition-colors"
      >
        <h3 className="text-sm font-medium text-od-text-dim uppercase tracking-wider">
          People ({people.length})
        </h3>
        <span className="text-od-text-dim text-xs">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="p-3 space-y-2">
          {people.map(person => (
            <div
              key={person.id}
              className="p-2 bg-od-bg-dark border border-od-surface-light rounded flex items-start gap-2"
            >
              {editingId === person.id ? (
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-od-text-dim uppercase">Name</label>
                      <input
                        type="text"
                        defaultValue={person.name}
                        onBlur={(e) => handleUpdate(person.id, { name: e.target.value })}
                        className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-od-text-dim uppercase">Role</label>
                      <input
                        type="text"
                        defaultValue={person.role || ''}
                        onBlur={(e) => handleUpdate(person.id, { role: e.target.value || null })}
                        className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
                        placeholder="Host, Guest..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-od-text-dim uppercase">vMix Input Key</label>
                      <input
                        type="text"
                        defaultValue={person.vmix_input_key || ''}
                        onBlur={(e) => handleUpdate(person.id, { vmix_input_key: e.target.value || null })}
                        className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
                        placeholder="cam1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-od-text-dim uppercase">Audio Bus</label>
                      <input
                        type="text"
                        defaultValue={person.audio_bus || 'A'}
                        onBlur={(e) => handleUpdate(person.id, { audio_bus: e.target.value || 'A' })}
                        className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
                        placeholder="A"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-od-text-dim">
                      <input
                        type="checkbox"
                        checked={person.auto_lower_third}
                        onChange={(e) => handleUpdate(person.id, { auto_lower_third: e.target.checked })}
                        className="rounded"
                      />
                      Auto Lower Third
                    </label>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-od-accent hover:text-blue-400 ml-auto"
                    >
                      Done
                    </button>
                  </div>
                  {person.auto_lower_third && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-od-text-dim uppercase">LT Line 1</label>
                        <input
                          type="text"
                          defaultValue={person.lower_third_line1 || ''}
                          onBlur={(e) => handleUpdate(person.id, { lower_third_line1: e.target.value || null })}
                          className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
                          placeholder={person.name}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-od-text-dim uppercase">LT Line 2</label>
                        <input
                          type="text"
                          defaultValue={person.lower_third_line2 || ''}
                          onBlur={(e) => handleUpdate(person.id, { lower_third_line2: e.target.value || null })}
                          className="w-full px-2 py-1 bg-od-surface border border-od-surface-light rounded text-xs text-white"
                          placeholder="Subtitle"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => setEditingId(person.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{person.name}</span>
                      {person.role && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-od-surface-light text-od-text-dim rounded">
                          {person.role}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-od-text-dim">
                      {person.vmix_input_key && <span>Input: {person.vmix_input_key}</span>}
                      {person.auto_lower_third && <span>Auto LT</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(person.id)}
                    className="text-red-400/50 hover:text-red-400 text-xs"
                  >
                    &times;
                  </button>
                </>
              )}
            </div>
          ))}

          <button
            onClick={handleAdd}
            className="w-full py-1.5 border border-dashed border-od-surface-light rounded text-xs text-od-text-dim hover:text-white hover:border-od-accent transition-colors"
          >
            + Add Person
          </button>
        </div>
      )}
    </div>
  );
}
