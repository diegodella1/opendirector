import { useAutomatorStore } from '@/stores/automator-store';
import { ElementRow } from './ElementRow';

const blockStatusStyles: Record<string, string> = {
  pending: 'border-l-od-text-dim',
  on_air: 'border-l-od-tally-pgm bg-od-tally-pgm/5',
  done: 'border-l-green-600',
  skipped: 'border-l-gray-600',
};

export function RundownPanel() {
  const { blocks, currentBlockIdx } = useAutomatorStore();

  return (
    <div className="h-full overflow-y-auto p-2">
      {blocks.map((block, idx) => {
        const isCurrent = idx === currentBlockIdx;
        const isPast = idx < currentBlockIdx;
        const statusStyle = isCurrent ? 'border-l-od-tally-pgm bg-od-tally-pgm/10' : blockStatusStyles[block.status] || '';

        return (
          <div
            key={block.id}
            className={`mb-2 border-l-4 rounded-r-lg ${statusStyle} ${isPast ? 'opacity-50' : ''}`}
          >
            {/* Block header */}
            <div className="flex items-center gap-3 px-3 py-2 bg-od-surface/50">
              <span className="text-od-text-dim text-xs font-mono w-8">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className={`font-medium text-sm ${isCurrent ? 'text-white' : 'text-od-text'}`}>
                {block.name}
              </span>
              {isCurrent && (
                <span className="text-[10px] uppercase tracking-wider text-od-tally-pgm font-bold">
                  CURRENT
                </span>
              )}
              {block.estimated_duration_sec > 0 && (
                <span className="text-od-text-dim text-xs ml-auto">
                  {Math.floor(block.estimated_duration_sec / 60)}:{String(block.estimated_duration_sec % 60).padStart(2, '0')}
                </span>
              )}
            </div>

            {/* Elements */}
            {block.elements.length > 0 && (
              <div className="px-3 pb-2">
                {block.elements.map((element) => (
                  <ElementRow key={element.id} element={element} blockId={block.id} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {blocks.length === 0 && (
        <div className="flex items-center justify-center h-full text-od-text-dim">
          No blocks in this show
        </div>
      )}
    </div>
  );
}
