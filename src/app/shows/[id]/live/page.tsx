'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { appPath } from '@/lib/app-path';
import { useLiveStore } from '@/stores/live-store';
import SignalPanel from '@/components/SignalPanel';
import {
  elapsedSec,
  blockRemaining,
  showRemaining,
  computeBackTimes,
  overUnder,
  formatDuration as fmtDur,
  formatDelta,
  timerColor,
  formatClockTime,
} from '@/lib/timing';

// Element type labels/colors
const elementTypeLabels: Record<string, { label: string; color: string }> = {
  clip: { label: 'CLIP', color: 'bg-purple-600' },
  graphic: { label: 'GFX', color: 'bg-green-600' },
  lower_third: { label: 'LT', color: 'bg-yellow-600' },
  audio: { label: 'AUD', color: 'bg-cyan-600' },
  note: { label: 'NOTE', color: 'bg-gray-500' },
};

function formatElapsed(startIso: string | null): string {
  if (!startIso) return '00:00:00';
  const sec = elapsedSec(startIso);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
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
    blockTimings,
    executionLog,
    tally,
    triggeredElements,
    wsConnected,
    automatorConnected,
    automatorMode,
    loadShow,
    connectWs,
    disconnectWs,
    sendSignal,
    clearSignals,
    setCurrentBlock,
    cueElement,
    nextBlock,
    prevBlock,
    stopShow,
    goLive,
    goReady,
    goRehearsal,
  } = useLiveStore();

  const [showTimer, setShowTimer] = useState('00:00:00');
  const [blockElapsedStr, setBlockElapsedStr] = useState('00:00');
  const [blockRemainingStr, setBlockRemainingStr] = useState('00:00');
  const [blockRemainingColor, setBlockRemainingColor] = useState('text-white');
  const [showRemainingStr, setShowRemainingStr] = useState('00:00');
  const [backTimes, setBackTimes] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  // Force re-render every second
  const [, setTick] = useState(0);

  useEffect(() => {
    loadShow(showId);
    connectWs(showId);
    return () => disconnectWs();
  }, [showId, loadShow, connectWs, disconnectWs]);

  const currentBlock = blocks.find((b) => b.id === currentBlockId);
  const currentBlockIdx = blocks.findIndex((b) => b.id === currentBlockId);

  // Timer update
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      setShowTimer(formatElapsed(showStartedAt));

      const elapsed = elapsedSec(blockStartedAt);
      const est = currentBlock?.estimated_duration_sec || 0;
      const remaining = blockRemaining(est, elapsed);

      setBlockElapsedStr(fmtDur(elapsed));
      if (est > 0) {
        setBlockRemainingStr(remaining < 0 ? formatDelta(Math.abs(remaining) * -1) : fmtDur(remaining));
        setBlockRemainingColor(timerColor(remaining, est));
      } else {
        setBlockRemainingStr(fmtDur(elapsed));
        setBlockRemainingColor('text-white');
      }

      setShowRemainingStr(fmtDur(showRemaining(blocks, currentBlockIdx, elapsed)));
      setBackTimes(computeBackTimes(blocks, currentBlockIdx, elapsed));
    }, 250);
    return () => clearInterval(interval);
  }, [showStartedAt, blockStartedAt, blocks, currentBlockIdx, currentBlock]);

  // Track execution errors
  useEffect(() => {
    const lastEntry = executionLog[0];
    if (lastEntry?.type === 'error') {
      setError(lastEntry.vmix_command || lastEntry.source || 'Execution error');
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [executionLog]);

  const handleSendSignal = useCallback(
    (type: string, value?: string) => {
      sendSignal(showId, type, value);
    },
    [showId, sendSignal]
  );

  const handleClearSignals = useCallback(() => {
    clearSignals(showId);
  }, [showId, clearSignals]);

  // Cue next pending element in current block
  const cueNextPending = useCallback(() => {
    const cb = blocks.find((b) => b.id === currentBlockId);
    if (!cb) return;
    const next = cb.elements.find(
      (el) => el.type !== 'note' && !triggeredElements.has(el.id)
    );
    if (next) cueElement(next.id);
  }, [blocks, currentBlockId, triggeredElements, cueElement]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          cueNextPending();
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          nextBlock();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          prevBlock();
          break;
        case 'Escape':
          e.preventDefault();
          stopShow();
          break;
        case 'F5':
          e.preventDefault();
          if (showStatus === 'live') {
            goReady();
          } else {
            goLive();
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showStatus, cueNextPending, nextBlock, prevBlock, stopShow, goLive, goReady]);

  const isLive = showStatus === 'live';
  const isRehearsal = showStatus === 'rehearsal';

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
            isLive ? 'bg-od-tally-pgm text-white animate-pulse' :
            isRehearsal ? 'bg-od-warning text-black' :
            'bg-od-surface-light text-od-text-dim'
          }`}>
            {showStatus}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Show elapsed */}
          <div className="text-right">
            <div className="text-od-text-dim text-[10px] uppercase">Show</div>
            <div className="text-white font-mono text-lg">{showTimer}</div>
          </div>
          {/* Block elapsed + remaining */}
          <div className="text-right">
            <div className="text-od-text-dim text-[10px] uppercase">Block</div>
            <div className="text-white font-mono text-sm">{blockElapsedStr}</div>
          </div>
          <div className="text-right">
            <div className="text-od-text-dim text-[10px] uppercase">Remaining</div>
            <div className={`font-mono text-lg font-bold ${blockRemainingColor}`}>{blockRemainingStr}</div>
          </div>
          {/* Show remaining */}
          <div className="text-right">
            <div className="text-od-text-dim text-[10px] uppercase">Show Left</div>
            <div className="text-od-text font-mono text-sm">{showRemainingStr}</div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${wsConnected ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400'}`}>
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            automatorConnected && automatorMode === 'auto'
              ? 'bg-green-600/30 text-green-400'
              : automatorConnected && automatorMode === 'manual'
              ? 'bg-yellow-600/30 text-yellow-400'
              : 'bg-red-600/20 text-red-400/60'
          }`}>
            Automator: {automatorConnected ? (automatorMode === 'auto' ? 'AUTO' : 'MANUAL') : 'OFF'}
          </span>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-600/90 text-white px-4 py-2 text-sm font-medium flex items-center justify-between shrink-0">
          <span>Error: {error}</span>
          <button onClick={() => setError(null)} className="text-white/70 hover:text-white">&times;</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left — Rundown sidebar */}
        <div className="w-72 bg-od-bg border-r border-od-surface-light flex flex-col shrink-0">
          <div className="p-2 border-b border-od-surface-light">
            <div className="text-xs text-od-text-dim text-center mb-1">
              Block {currentBlockIdx + 1} of {blocks.length}
            </div>
            {/* Block progress bar */}
            <div className="w-full bg-od-surface-light rounded-full h-1.5">
              <div
                className="bg-od-accent h-1.5 rounded-full transition-all"
                style={{ width: blocks.length > 0 ? `${((currentBlockIdx + 1) / blocks.length) * 100}%` : '0%' }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {blocks.map((block, idx) => {
              const isDone = block.status === 'done' || (blockTimings[block.id]?.endedAt != null);
              const isCurrent = block.id === currentBlockId;
              const isFuture = idx > currentBlockIdx;
              const bt = backTimes[block.id];

              // Over/under for completed blocks
              let ouBadge = null;
              if (isDone && block.estimated_duration_sec > 0) {
                const actual = block.actual_duration_sec ?? blockTimings[block.id]?.actualDurationSec;
                if (actual != null) {
                  const delta = overUnder(block.estimated_duration_sec, actual);
                  const color = delta > 0 ? 'text-red-400 bg-red-400/10' : 'text-green-400 bg-green-400/10';
                  ouBadge = (
                    <span className={`text-[10px] font-mono font-bold px-1 rounded ${color}`}>
                      {formatDelta(delta)}
                    </span>
                  );
                }
              }

              return (
                <div
                  key={block.id}
                  onClick={() => setCurrentBlock(block.id)}
                  className={`p-2 border-b border-od-surface-light cursor-pointer transition-colors text-sm ${
                    isCurrent
                      ? 'bg-od-accent/20 border-l-2 border-l-od-accent'
                      : isDone
                      ? 'opacity-50'
                      : 'hover:bg-od-surface/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-od-text-dim text-xs font-mono w-5">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className={`font-medium truncate flex-1 ${
                      isCurrent ? 'text-od-accent' : 'text-white'
                    }`}>
                      {block.name}
                    </span>
                    {ouBadge}
                  </div>
                  <div className="text-od-text-dim text-xs ml-7 mt-0.5 flex items-center gap-2">
                    {block.elements.length > 0 && (
                      <span>
                        {block.elements.length} el{block.elements.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {block.estimated_duration_sec > 0 && (
                      <span>{fmtDur(block.estimated_duration_sec)}</span>
                    )}
                    {/* Back-time for future blocks */}
                    {isFuture && bt && (
                      <span className="ml-auto text-od-accent font-mono font-medium">
                        {formatClockTime(bt)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Block navigation */}
          <div className="p-2 border-t border-od-surface-light flex gap-1">
            <button
              onClick={prevBlock}
              disabled={currentBlockIdx <= 0}
              className="flex-1 py-2 bg-od-surface-light text-white text-sm rounded hover:bg-od-accent/30 transition-colors disabled:opacity-30 font-medium"
            >
              &larr; PREV (P)
            </button>
            <button
              onClick={nextBlock}
              disabled={currentBlockIdx >= blocks.length - 1}
              className="flex-1 py-2 bg-od-accent text-white text-sm rounded hover:bg-blue-500 transition-colors disabled:opacity-30 font-bold"
            >
              NEXT (N) &rarr;
            </button>
          </div>
        </div>

        {/* Center — Control Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tally + Status controls */}
          <div className="p-4 border-b border-od-surface-light">
            <div className="flex items-center gap-4 mb-3">
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
              {/* REC/STREAM indicators */}
              {tally.recording && (
                <span className="px-3 py-2 rounded font-bold text-sm bg-red-600 text-white animate-pulse">
                  REC
                </span>
              )}
              {tally.streaming && (
                <span className="px-3 py-2 rounded font-bold text-sm bg-blue-600 text-white">
                  STREAM
                </span>
              )}
              <div className="flex-1" />
            </div>

            {/* Status control buttons */}
            <div className="flex gap-2">
              <button
                onClick={goRehearsal}
                disabled={isLive || isRehearsal}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  isRehearsal
                    ? 'bg-od-warning text-black'
                    : 'bg-od-surface-light text-od-text hover:bg-od-warning/30 disabled:opacity-30'
                }`}
              >
                REHEARSAL
              </button>
              <button
                onClick={goLive}
                disabled={isLive}
                className={`px-5 py-2 rounded text-sm font-bold transition-colors ${
                  isLive
                    ? 'bg-od-tally-pgm text-white animate-pulse'
                    : 'bg-red-700 text-white hover:bg-red-600 disabled:opacity-30'
                }`}
              >
                {isLive ? 'ON AIR' : 'GO LIVE (F5)'}
              </button>
              <button
                onClick={stopShow}
                disabled={!isLive && !isRehearsal}
                className="px-4 py-2 bg-od-surface-light text-od-text rounded text-sm font-medium hover:bg-red-600/30 hover:text-red-400 transition-colors disabled:opacity-30"
              >
                STOP (Esc)
              </button>
              <button
                onClick={goReady}
                disabled={showStatus === 'ready' || showStatus === 'draft'}
                className="px-4 py-2 bg-od-surface-light text-od-text rounded text-sm font-medium hover:bg-od-accent/30 transition-colors disabled:opacity-30"
              >
                RESET
              </button>
            </div>
          </div>

          {/* Current block + elements */}
          <div className="flex-1 overflow-y-auto">
            {currentBlock ? (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-white font-semibold text-lg">
                    {currentBlock.name}
                  </h2>
                  {currentBlock.estimated_duration_sec > 0 && (
                    <span className="text-od-text-dim text-sm">
                      Est. {fmtDur(currentBlock.estimated_duration_sec)}
                    </span>
                  )}
                </div>

                {/* Element list with CUE buttons */}
                <div className="space-y-1.5">
                  {currentBlock.elements.map((el) => {
                    const info = elementTypeLabels[el.type] || { label: '?', color: 'bg-gray-500' };
                    const isTriggered = triggeredElements.has(el.id);
                    const isNote = el.type === 'note';

                    return (
                      <div
                        key={el.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                          isTriggered
                            ? 'bg-green-900/30 border border-green-600/30'
                            : 'bg-od-surface border border-od-surface-light'
                        }`}
                      >
                        {/* Status indicator */}
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          isTriggered ? 'bg-green-400' : 'bg-od-text-dim/30'
                        }`} />

                        {/* Type badge */}
                        <span className={`${info.color} text-white text-[10px] px-2 py-0.5 rounded font-medium shrink-0`}>
                          {info.label}
                        </span>

                        {/* Title + subtitle */}
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-sm truncate block">
                            {el.title || 'Untitled'}
                          </span>
                          {el.subtitle && (
                            <span className="text-od-text-dim text-xs truncate block">{el.subtitle}</span>
                          )}
                        </div>

                        {/* Duration */}
                        {el.duration_sec && (
                          <span className="text-od-text-dim text-xs font-mono shrink-0">{el.duration_sec}s</span>
                        )}

                        {/* CUE button */}
                        {!isNote && (
                          <button
                            onClick={() => cueElement(el.id)}
                            disabled={isTriggered}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors shrink-0 ${
                              isTriggered
                                ? 'bg-green-600/20 text-green-400/50 cursor-default'
                                : 'bg-od-tally-pgm text-white hover:bg-red-500 active:scale-95'
                            }`}
                          >
                            {isTriggered ? 'DONE' : 'CUE'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {currentBlock.elements.length === 0 && (
                  <p className="text-od-text-dim text-sm text-center py-8">No elements in this block</p>
                )}

                {/* Quick CUE next */}
                {currentBlock.elements.some((el) => el.type !== 'note' && !triggeredElements.has(el.id)) && (
                  <div className="mt-4">
                    <button
                      onClick={cueNextPending}
                      className="w-full py-3 bg-od-tally-pgm/90 text-white rounded-lg font-bold text-sm hover:bg-red-500 active:scale-[0.99] transition-all"
                    >
                      CUE NEXT (Space)
                    </button>
                  </div>
                )}

                {/* Script preview */}
                {currentBlock.script && (
                  <div className="mt-4 p-3 bg-od-bg-dark border border-od-surface-light rounded-lg">
                    <h4 className="text-[10px] uppercase text-od-text-dim tracking-wider mb-1">Script</h4>
                    <pre className="text-xs text-od-text whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">
                      {currentBlock.script}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-od-text-dim">
                <p>No block selected</p>
              </div>
            )}
          </div>

          {/* Execution log */}
          <div className="h-48 border-t border-od-surface-light overflow-y-auto p-3 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[10px] font-medium text-od-text-dim uppercase tracking-wider">
                Execution Log
              </h3>
              <a
                href={appPath(`/api/shows/${showId}/execution-log/export`)}
                download
                className="text-[10px] px-2 py-0.5 bg-od-surface-light text-od-text-dim rounded hover:text-white transition-colors"
              >
                Export CSV
              </a>
            </div>
            <div className="space-y-0.5 font-mono text-xs">
              {executionLog.length === 0 ? (
                <p className="text-od-text-dim">No events yet</p>
              ) : (
                executionLog.map((entry, i) => (
                  <div key={i} className="flex gap-2 text-od-text-dim">
                    <span className="text-od-text-dim/50 w-20 shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`w-28 shrink-0 ${
                      entry.type === 'error' ? 'text-red-400' :
                      entry.type === 'cue' || entry.type === 'cue_ack' ? 'text-green-400' :
                      entry.type === 'show_status_changed' ? 'text-yellow-400' :
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

        {/* Right — Signals + Notes */}
        <div className="w-80 bg-od-bg border-l border-od-surface-light flex flex-col shrink-0">
          {/* Signal Panel */}
          <div className="p-4 border-b border-od-surface-light">
            <SignalPanel
              showId={showId}
              onSendSignal={handleSendSignal}
              onClearSignals={handleClearSignals}
            />
          </div>

          {/* Current block notes */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-sm font-medium text-od-text-dim uppercase tracking-wider mb-2">
              Notes — {currentBlock?.name || 'No block selected'}
            </h3>
            {currentBlock?.notes ? (
              <pre className="text-sm text-od-text-dim whitespace-pre-wrap font-mono leading-relaxed">
                {currentBlock.notes}
              </pre>
            ) : (
              <p className="text-od-text-dim text-sm italic">No production notes</p>
            )}
          </div>

          {/* Keyboard shortcuts legend */}
          <div className="p-3 border-t border-od-surface-light">
            <div className="text-[10px] uppercase text-od-text-dim/50 tracking-wider mb-1">Shortcuts</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-od-text-dim">
              <span><kbd className="bg-od-surface-light px-1 rounded">Space</kbd> CUE Next</span>
              <span><kbd className="bg-od-surface-light px-1 rounded">N</kbd> Next Block</span>
              <span><kbd className="bg-od-surface-light px-1 rounded">P</kbd> Prev Block</span>
              <span><kbd className="bg-od-surface-light px-1 rounded">Esc</kbd> Stop</span>
              <span><kbd className="bg-od-surface-light px-1 rounded">F5</kbd> Go Live</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
