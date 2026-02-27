'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRundownStore } from '@/stores/rundown-store';

// Element type icons/labels
const elementTypeLabels: Record<string, { label: string; color: string }> = {
  clip: { label: 'CLIP', color: 'bg-purple-600' },
  graphic: { label: 'GFX', color: 'bg-green-600' },
  lower_third: { label: 'LT', color: 'bg-yellow-600' },
  audio: { label: 'AUD', color: 'bg-cyan-600' },
  note: { label: 'NOTE', color: 'bg-gray-500' },
};

export default function EditorPage() {
  const params = useParams();
  const showId = params.id as string;

  const {
    show,
    blocks,
    selectedBlockId,
    wsConnected,
    loadRundown,
    addBlock,
    updateBlock,
    deleteBlock,
    addElement,
    deleteElement,
    selectBlock,
    connectWs,
    disconnectWs,
  } = useRundownStore();

  const [newBlockName, setNewBlockName] = useState('');
  const [editingScript, setEditingScript] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState('');

  useEffect(() => {
    loadRundown(showId);
    connectWs(showId);
    return () => disconnectWs();
  }, [showId, loadRundown, connectWs, disconnectWs]);

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

  if (!show) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-od-text-dim">Loading show...</p>
      </div>
    );
  }

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
          <span className="text-xs text-od-text-dim uppercase bg-od-surface-light px-2 py-0.5 rounded">
            {show.status}
          </span>
          <span className="text-xs text-od-text-dim">v{show.version}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded ${wsConnected ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400'}`}>
            {wsConnected ? 'WS Connected' : 'WS Disconnected'}
          </span>
          <Link
            href={`/shows/${showId}/prompter`}
            className="text-sm px-3 py-1 bg-od-surface-light rounded hover:bg-od-accent/30 transition-colors"
            target="_blank"
          >
            Prompter
          </Link>
        </div>
      </header>

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
                onKeyDown={(e) => e.key === 'Enter' && handleAddBlock()}
                placeholder="New block..."
                className="flex-1 px-3 py-1.5 bg-od-surface border border-od-surface-light rounded text-sm text-white placeholder-od-text-dim focus:outline-none focus:border-od-accent"
              />
              <button
                onClick={handleAddBlock}
                className="px-3 py-1.5 bg-od-accent text-white rounded text-sm hover:bg-blue-500 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Block List */}
          <div className="flex-1 overflow-y-auto">
            {blocks.length === 0 ? (
              <p className="text-od-text-dim text-sm p-4 text-center">
                No blocks yet. Add one above.
              </p>
            ) : (
              blocks.map((block, idx) => (
                <div
                  key={block.id}
                  onClick={() => selectBlock(block.id)}
                  className={`p-3 border-b border-od-surface-light cursor-pointer transition-colors ${
                    selectedBlockId === block.id
                      ? 'bg-od-accent/20 border-l-2 border-l-od-accent'
                      : 'hover:bg-od-surface/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-od-text-dim text-xs font-mono w-6">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-white text-sm font-medium truncate">
                        {block.name}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBlock(showId, block.id);
                      }}
                      className="text-red-400/50 hover:text-red-400 text-xs transition-colors"
                    >
                      &times;
                    </button>
                  </div>
                  {block.elements.length > 0 && (
                    <div className="flex gap-1 mt-1.5 ml-8">
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
                    <p className="text-od-text-dim text-xs mt-1 ml-8 truncate">
                      {block.script.substring(0, 50)}...
                    </p>
                  )}
                </div>
              ))
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

              {/* Elements Section */}
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
                        className={`${info.color} text-white text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity`}
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
                  <div className="space-y-2">
                    {selectedBlock.elements.map((el) => {
                      const info = elementTypeLabels[el.type] || { label: '?', color: 'bg-gray-500' };
                      return (
                        <div
                          key={el.id}
                          className="flex items-center gap-3 p-3 bg-od-surface border border-od-surface-light rounded-lg"
                        >
                          <span className={`${info.color} text-white text-xs px-2 py-0.5 rounded font-medium`}>
                            {info.label}
                          </span>
                          <span className="text-white text-sm flex-1">
                            {el.title || 'Untitled'}
                          </span>
                          {el.subtitle && (
                            <span className="text-od-text-dim text-xs">
                              {el.subtitle}
                            </span>
                          )}
                          {el.duration_sec && (
                            <span className="text-od-text-dim text-xs font-mono">
                              {el.duration_sec}s
                            </span>
                          )}
                          <span className="text-od-text-dim text-xs">
                            {el.trigger_type}
                          </span>
                          <button
                            onClick={() => deleteElement(showId, selectedBlock.id, el.id)}
                            className="text-red-400/50 hover:text-red-400 text-sm transition-colors"
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
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
      </div>
    </div>
  );
}
