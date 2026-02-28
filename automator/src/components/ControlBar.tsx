import { useAutomatorStore } from '@/stores/automator-store';

export function ControlBar() {
  const { currentBlockIdx, blocks, nextBlock, prevBlock, disconnect } = useAutomatorStore();
  const currentBlock = blocks[currentBlockIdx];
  const totalBlocks = blocks.length;

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
          className="px-4 py-1.5 bg-red-600/20 text-red-400 rounded text-sm font-medium hover:bg-red-600/30 transition-colors"
          title="Stop (Esc)"
        >
          STOP
          <span className="ml-2 text-xs opacity-60">Esc</span>
        </button>
      </div>

      {/* Block info */}
      <div className="text-center">
        <span className="text-od-text-dim text-xs">Block </span>
        <span className="text-white font-bold">
          {currentBlockIdx + 1}/{totalBlocks}
        </span>
        {currentBlock && (
          <span className="text-od-text-dim text-xs ml-2">{currentBlock.name}</span>
        )}
      </div>

      {/* Disconnect */}
      <button
        onClick={disconnect}
        className="px-3 py-1.5 text-od-text-dim text-xs hover:text-red-400 transition-colors"
      >
        Disconnect
      </button>
    </div>
  );
}
