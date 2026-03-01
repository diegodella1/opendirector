import { useEffect, useState } from 'react';
import { useAutomatorStore } from '@/stores/automator-store';
import {
  elapsedSec,
  blockRemaining,
  showRemaining as calcShowRemaining,
  formatDuration,
  formatDelta,
  timerColor,
} from '@/lib/timing';

export function ControlBar() {
  const { currentBlockIdx, blocks, show, nextBlock, prevBlock, disconnect, stopShow, resetShow, toggleRehearsal, panicCut, config, vmixConnected, blockStartedAt, showStartedAt } = useAutomatorStore();
  const currentBlock = blocks[currentBlockIdx];
  const totalBlocks = blocks.length;
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(interval);
  }, []);

  const elapsed = elapsedSec(blockStartedAt);
  const est = currentBlock?.estimated_duration_sec || 0;
  const remaining = blockRemaining(est, elapsed);
  const showElapsed = elapsedSec(showStartedAt);
  const showRem = calcShowRemaining(blocks, currentBlockIdx, elapsed);

  const blockCountdownStr = est > 0
    ? (remaining < 0 ? formatDelta(remaining) : formatDuration(remaining))
    : formatDuration(elapsed);
  const countdownColor = est > 0 ? timerColor(remaining, est) : 'text-white';

  // Show timer
  const showH = Math.floor(showElapsed / 3600);
  const showM = Math.floor((showElapsed % 3600) / 60);
  const showS = showElapsed % 60;
  const showTimerStr = `${String(showH).padStart(2, '0')}:${String(showM).padStart(2, '0')}:${String(showS).padStart(2, '0')}`;

  return (
    <div className="bg-od-surface border-t border-od-surface-light px-4 py-2 flex items-center justify-between shrink-0">
      {/* Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => prevBlock()}
          disabled={currentBlockIdx === 0}
          className="px-4 py-1.5 bg-od-surface-light text-od-text rounded text-sm font-medium hover:bg-od-accent/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          &#9664; PREV
        </button>

        <button
          onClick={() => nextBlock()}
          disabled={currentBlockIdx >= totalBlocks - 1}
          className="px-6 py-1.5 bg-od-accent text-white rounded text-sm font-bold hover:bg-blue-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          NEXT &#9654;
          <span className="ml-2 text-xs opacity-60">Space</span>
        </button>

        <button
          onClick={() => stopShow()}
          className="px-4 py-1.5 bg-red-600/20 text-red-400 rounded text-sm font-medium hover:bg-red-600/30 transition-colors"
          title="Stop show (Esc)"
        >
          STOP
          <span className="ml-2 text-xs opacity-60">Esc</span>
        </button>

        <button
          onClick={() => resetShow()}
          className="px-4 py-1.5 bg-od-surface-light text-od-text rounded text-sm font-medium hover:bg-od-accent/30 transition-colors"
          title="Reset show (R)"
        >
          RESET
          <span className="ml-2 text-xs opacity-60">R</span>
        </button>

        <button
          onClick={() => toggleRehearsal()}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            show?.status === 'rehearsal'
              ? 'bg-yellow-600/30 text-yellow-400 hover:bg-yellow-600/40'
              : 'bg-od-surface-light text-od-text hover:bg-yellow-600/20'
          }`}
          title="Toggle rehearsal (Ctrl+R)"
        >
          REHEARSAL
          <span className="ml-2 text-xs opacity-60">Ctrl+R</span>
        </button>

        <button
          onClick={() => panicCut()}
          disabled={!vmixConnected || !config?.overrun_safe_input_key}
          className="px-4 py-1.5 bg-red-700 text-white rounded text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed animate-none hover:animate-pulse"
          title="Emergency cut to safe input (F12)"
        >
          PANIC F12
        </button>
      </div>

      {/* Timing */}
      <div className="flex items-center gap-6">
        {/* Block countdown */}
        <div className="text-center">
          <div className="text-od-text-dim text-[10px] uppercase">Block</div>
          <div className={`font-mono text-lg font-bold ${countdownColor}`}>
            {blockCountdownStr}
          </div>
        </div>
        {/* Show timer */}
        <div className="text-center">
          <div className="text-od-text-dim text-[10px] uppercase">Show</div>
          <div className="font-mono text-sm text-white">{showTimerStr}</div>
        </div>
        {/* Show remaining */}
        <div className="text-center">
          <div className="text-od-text-dim text-[10px] uppercase">Remaining</div>
          <div className="font-mono text-sm text-od-text">{formatDuration(showRem)}</div>
        </div>
      </div>

      {/* Block info + Disconnect */}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <span className="text-od-text-dim text-xs">Block </span>
          <span className="text-white font-bold">
            {currentBlockIdx + 1}/{totalBlocks}
          </span>
          {currentBlock && (
            <span className="text-od-text-dim text-xs ml-2">{currentBlock.name}</span>
          )}
        </div>
        <button
          onClick={disconnect}
          className="px-3 py-1.5 text-od-text-dim text-xs hover:text-red-400 transition-colors"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
