'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLiveStore } from '@/stores/live-store';
import SignalPanel from '@/components/SignalPanel';

function formatDuration(startIso: string | null): string {
  if (!startIso) return '00:00:00';
  const elapsed = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function LivePage() {
  const params = useParams();
  const showId = params.id as string;

  const {
    showName,
    showStatus,
    blocks,
    currentBlockId,
    showStartedAt,
    blockStartedAt,
    executionLog,
    tally,
    wsConnected,
    loadShow,
    connectWs,
    disconnectWs,
    sendSignal,
    clearSignals,
    setCurrentBlock,
  } = useLiveStore();

  const [showTimer, setShowTimer] = useState('00:00:00');
  const [blockTimer, setBlockTimer] = useState('00:00:00');

  useEffect(() => {
    loadShow(showId);
    connectWs(showId);
    return () => disconnectWs();
  }, [showId, loadShow, connectWs, disconnectWs]);

  // Timer update
  useEffect(() => {
    const interval = setInterval(() => {
      setShowTimer(formatDuration(showStartedAt));
      setBlockTimer(formatDuration(blockStartedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [showStartedAt, blockStartedAt]);

  const handleSendSignal = useCallback(
    (type: string, value?: string) => {
      sendSignal(showId, type, value);
    },
    [showId, sendSignal]
  );

  const handleClearSignals = useCallback(() => {
    clearSignals(showId);
  }, [showId, clearSignals]);

  const currentBlock = blocks.find((b) => b.id === currentBlockId);
  const currentBlockIdx = blocks.findIndex((b) => b.id === currentBlockId);

  const handlePrevBlock = () => {
    if (currentBlockIdx > 0) {
      setCurrentBlock(blocks[currentBlockIdx - 1].id);
    }
  };

  const handleNextBlock = () => {
    if (currentBlockIdx < blocks.length - 1) {
      setCurrentBlock(blocks[currentBlockIdx + 1].id);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-od-bg">
      {/* Top Bar */}
      <header className="bg-od-surface border-b border-od-surface-light px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/shows/${showId}/edit`} className="text-od-text-dim hover:text-white transition-colors">
            &larr; Editor
          </Link>
          <h1 className="text-lg font-semibold text-white">{showName}</h1>
          <span className={`text-xs uppercase px-2 py-0.5 rounded font-bold ${
            showStatus === 'live' ? 'bg-od-tally-pgm text-white animate-pulse' :
            showStatus === 'rehearsal' ? 'bg-od-warning text-black' :
            'bg-od-surface-light text-od-text-dim'
          }`}>
            {showStatus}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-od-text-dim text-[10px] uppercase">Show</div>
            <div className="text-white font-mono text-lg">{showTimer}</div>
          </div>
          <div className="text-right">
            <div className="text-od-text-dim text-[10px] uppercase">Block</div>
            <div className="text-white font-mono text-lg">{blockTimer}</div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${wsConnected ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400'}`}>
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left — Rundown sidebar */}
        <div className="w-72 bg-od-bg border-r border-od-surface-light flex flex-col shrink-0">
          <div className="p-2 border-b border-od-surface-light flex gap-1">
            <button
              onClick={handlePrevBlock}
              disabled={currentBlockIdx <= 0}
              className="flex-1 py-1.5 bg-od-surface-light text-white text-sm rounded hover:bg-od-accent/30 transition-colors disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={handleNextBlock}
              disabled={currentBlockIdx >= blocks.length - 1}
              className="flex-1 py-1.5 bg-od-accent text-white text-sm rounded hover:bg-blue-500 transition-colors disabled:opacity-30 font-medium"
            >
              Next
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {blocks.map((block, idx) => (
              <div
                key={block.id}
                onClick={() => setCurrentBlock(block.id)}
                className={`p-2 border-b border-od-surface-light cursor-pointer transition-colors text-sm ${
                  block.id === currentBlockId
                    ? 'bg-od-accent/20 border-l-2 border-l-od-accent'
                    : block.status === 'done'
                    ? 'opacity-50'
                    : 'hover:bg-od-surface/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-od-text-dim text-xs font-mono w-5">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className={`text-white font-medium truncate ${
                    block.id === currentBlockId ? 'text-od-accent' : ''
                  }`}>
                    {block.name}
                  </span>
                </div>
                {block.elements.length > 0 && (
                  <div className="text-od-text-dim text-xs ml-7 mt-0.5">
                    {block.elements.length} element{block.elements.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center — Monitor + Execution log */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tally + Timing area */}
          <div className="p-4 border-b border-od-surface-light">
            <div className="flex items-center gap-4">
              {/* Tally indicators */}
              <div className="flex gap-2">
                <div className={`px-4 py-2 rounded font-bold text-sm ${
                  tally.program ? 'bg-od-tally-pgm text-white' : 'bg-od-surface-light text-od-text-dim'
                }`}>
                  PGM{tally.program ? `: ${tally.program}` : ''}
                </div>
                <div className={`px-4 py-2 rounded font-bold text-sm ${
                  tally.preview ? 'bg-od-tally-pvw text-black' : 'bg-od-surface-light text-od-text-dim'
                }`}>
                  PVW{tally.preview ? `: ${tally.preview}` : ''}
                </div>
              </div>
              <div className="flex-1" />
              <div className="text-od-text-dim text-sm">
                Block {currentBlockIdx + 1} of {blocks.length}
              </div>
            </div>
          </div>

          {/* Execution log */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-sm font-medium text-od-text-dim uppercase tracking-wider mb-2">
              Execution Log
            </h3>
            <div className="space-y-1 font-mono text-xs">
              {executionLog.length === 0 ? (
                <p className="text-od-text-dim">No events yet</p>
              ) : (
                executionLog.map((entry, i) => (
                  <div key={i} className="flex gap-2 text-od-text-dim">
                    <span className="text-od-text-dim/50 w-20 shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`w-24 shrink-0 ${
                      entry.type === 'error' ? 'text-red-400' :
                      entry.type === 'cue' ? 'text-green-400' :
                      'text-od-text-dim'
                    }`}>
                      {entry.type}
                    </span>
                    <span className="truncate">
                      {entry.vmix_command || entry.source || ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right — Signals + Script */}
        <div className="w-80 bg-od-bg border-l border-od-surface-light flex flex-col shrink-0">
          {/* Signal Panel */}
          <div className="p-4 border-b border-od-surface-light">
            <SignalPanel
              showId={showId}
              onSendSignal={handleSendSignal}
              onClearSignals={handleClearSignals}
            />
          </div>

          {/* Current block script */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-sm font-medium text-od-text-dim uppercase tracking-wider mb-2">
              Script — {currentBlock?.name || 'No block selected'}
            </h3>
            {currentBlock?.script ? (
              <pre className="text-sm text-od-text whitespace-pre-wrap font-mono leading-relaxed">
                {currentBlock.script}
              </pre>
            ) : (
              <p className="text-od-text-dim text-sm italic">No script for this block</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
