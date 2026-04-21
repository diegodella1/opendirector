'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { appPath } from '@/lib/app-path';
import type { Show, Template } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  const [shows, setShows] = useState<Show[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newShowName, setNewShowName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveTemplateShowId, setSaveTemplateShowId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');

  const fetchShows = async () => {
    const res = await fetch(appPath('/api/shows'));
    if (res.ok) setShows(await res.json());
    setLoading(false);
  };

  const fetchTemplates = async () => {
    const res = await fetch(appPath('/api/templates'));
    if (res.ok) setTemplates(await res.json());
  };

  useEffect(() => {
    fetchShows();
    fetchTemplates();
  }, []);

  const createShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShowName.trim()) return;

    if (selectedTemplateId) {
      // Create from template
      const res = await fetch(appPath(`/api/shows/from-template/${selectedTemplateId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newShowName.trim() }),
      });
      if (res.ok) {
        const show = await res.json();
        setNewShowName('');
        setSelectedTemplateId('');
        router.push(`/shows/${show.id}/edit`);
      }
    } else {
      const res = await fetch(appPath('/api/shows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newShowName.trim() }),
      });
      if (res.ok) {
        setNewShowName('');
        fetchShows();
      }
    }
  };

  const deleteShow = async (id: string) => {
    if (!confirm('Delete this show?')) return;
    await fetch(appPath(`/api/shows/${id}`), { method: 'DELETE' });
    fetchShows();
  };

  const saveAsTemplate = async () => {
    if (!saveTemplateShowId || !templateName.trim()) return;
    const res = await fetch(appPath('/api/templates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId: saveTemplateShowId, name: templateName.trim() }),
    });
    if (res.ok) {
      setSaveTemplateShowId(null);
      setTemplateName('');
      fetchTemplates();
    }
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
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">OpenDirector</h1>
          <p className="text-od-text-dim mt-1">Live TV production system</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/manual"
            className="px-4 py-2 bg-od-surface border border-od-surface-light text-od-text rounded-lg hover:border-od-accent/50 hover:text-white transition-colors text-sm"
          >
            User Guide
          </Link>
          <Link
            href="/download"
            className="flex items-center gap-2 px-4 py-2 bg-od-surface border border-od-surface-light text-od-text rounded-lg hover:border-od-accent/50 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Automator
          </Link>
        </div>
      </header>

      {/* New Show Form */}
      <form onSubmit={createShow} className="flex gap-3 mb-4">
        <input
          type="text"
          value={newShowName}
          onChange={(e) => setNewShowName(e.target.value)}
          placeholder="New show name..."
          className="flex-1 px-4 py-2 bg-od-surface border border-od-surface-light rounded-lg text-white placeholder-od-text-dim focus:outline-none focus:border-od-accent"
        />
        <select
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          className="px-3 py-2 bg-od-surface border border-od-surface-light rounded-lg text-od-text-dim text-sm focus:outline-none focus:border-od-accent"
        >
          <option value="">Blank show</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              From: {t.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-6 py-2 bg-od-accent text-white rounded-lg hover:bg-blue-500 transition-colors font-medium"
        >
          New Show
        </button>
      </form>

      {/* Save Template Modal */}
      {saveTemplateShowId && (
        <div className="mb-6 p-4 bg-od-surface border border-od-surface-light rounded-lg">
          <h3 className="text-white text-sm font-medium mb-2">Save as Template</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name..."
              className="flex-1 px-3 py-2 bg-od-bg-dark border border-od-surface-light rounded text-sm text-white placeholder-od-text-dim focus:outline-none focus:border-od-accent"
            />
            <button
              onClick={saveAsTemplate}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-500 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setSaveTemplateShowId(null)}
              className="px-4 py-2 bg-od-surface-light text-od-text rounded text-sm hover:bg-od-surface-light/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
                    href={`/shows/${show.id}/live`}
                    className="px-4 py-1.5 bg-od-tally-pgm/20 text-od-tally-pgm rounded hover:bg-od-tally-pgm/30 transition-colors text-sm font-medium"
                  >
                    Go Live
                  </Link>
                  <Link
                    href={`/shows/${show.id}/prompter`}
                    className="px-4 py-1.5 bg-od-surface-light text-od-text rounded hover:bg-od-surface-light/80 transition-colors text-sm"
                  >
                    Prompter
                  </Link>
                  <button
                    onClick={() => {
                      setSaveTemplateShowId(show.id);
                      setTemplateName(show.name);
                    }}
                    className="px-3 py-1.5 text-od-accent hover:bg-od-accent/20 rounded transition-colors text-sm"
                  >
                    Save Template
                  </button>
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
