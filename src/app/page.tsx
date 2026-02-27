'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Show } from '@/lib/types';

export default function HomePage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [newShowName, setNewShowName] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchShows = async () => {
    const res = await fetch('/api/shows');
    if (res.ok) {
      setShows(await res.json());
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchShows();
  }, []);

  const createShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShowName.trim()) return;

    const res = await fetch('/api/shows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newShowName.trim() }),
    });

    if (res.ok) {
      setNewShowName('');
      fetchShows();
    }
  };

  const deleteShow = async (id: string) => {
    if (!confirm('Delete this show?')) return;
    await fetch(`/api/shows/${id}`, { method: 'DELETE' });
    fetchShows();
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-600',
    ready: 'bg-blue-600',
    rehearsal: 'bg-od-warning',
    live: 'bg-od-tally-pgm',
    archived: 'bg-gray-800',
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">OpenDirector</h1>
        <p className="text-od-text-dim mt-1">Live TV production system</p>
      </header>

      {/* New Show Form */}
      <form onSubmit={createShow} className="flex gap-3 mb-8">
        <input
          type="text"
          value={newShowName}
          onChange={(e) => setNewShowName(e.target.value)}
          placeholder="New show name..."
          className="flex-1 px-4 py-2 bg-od-surface border border-od-surface-light rounded-lg text-white placeholder-od-text-dim focus:outline-none focus:border-od-accent"
        />
        <button
          type="submit"
          className="px-6 py-2 bg-od-accent text-white rounded-lg hover:bg-blue-500 transition-colors font-medium"
        >
          New Show
        </button>
      </form>

      {/* Shows List */}
      {loading ? (
        <p className="text-od-text-dim">Loading...</p>
      ) : shows.length === 0 ? (
        <div className="text-center py-16 text-od-text-dim">
          <p className="text-xl mb-2">No shows yet</p>
          <p>Create your first show to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {shows.map((show) => (
            <div
              key={show.id}
              className="bg-od-surface border border-od-surface-light rounded-lg p-4 hover:border-od-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${statusColors[show.status] || 'bg-gray-600'}`}
                  >
                    {show.status}
                  </span>
                  <h2 className="text-lg font-semibold text-white">
                    {show.name}
                  </h2>
                  <span className="text-od-text-dim text-sm">
                    v{show.version}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/shows/${show.id}/edit`}
                    className="px-4 py-1.5 bg-od-accent/20 text-od-accent rounded hover:bg-od-accent/30 transition-colors text-sm font-medium"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/shows/${show.id}/prompter`}
                    className="px-4 py-1.5 bg-od-surface-light text-od-text rounded hover:bg-od-surface-light/80 transition-colors text-sm"
                  >
                    Prompter
                  </Link>
                  <button
                    onClick={() => deleteShow(show.id)}
                    className="px-3 py-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-od-text-dim text-sm mt-2">
                Created {new Date(show.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
