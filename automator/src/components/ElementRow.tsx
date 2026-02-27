import { useAutomatorStore } from '@/stores/automator-store';
import type { ElementWithActions } from '@/lib/types';

const typeStyles: Record<string, { label: string; bg: string }> = {
  clip: { label: 'CLIP', bg: 'bg-purple-600' },
  graphic: { label: 'GFX', bg: 'bg-green-600' },
  lower_third: { label: 'LT', bg: 'bg-yellow-600' },
  audio: { label: 'AUD', bg: 'bg-cyan-600' },
  note: { label: 'NOTE', bg: 'bg-gray-500' },
};

const stepColorMap: Record<string, string> = {
  green: 'bg-green-600 hover:bg-green-500',
  red: 'bg-red-600 hover:bg-red-500',
  blue: 'bg-blue-600 hover:bg-blue-500',
  yellow: 'bg-yellow-600 hover:bg-yellow-500',
};

interface Props {
  element: ElementWithActions;
  blockId: string;
}

export function ElementRow({ element }: Props) {
  const { selectedElementId, selectElement, cueElement, executeStep } = useAutomatorStore();
  const isSelected = selectedElementId === element.id;
  const typeInfo = typeStyles[element.type] || { label: '?', bg: 'bg-gray-500' };

  const cueActions = element.actions.filter(a => a.phase === 'on_cue');
  const stepActions = element.actions.filter(a => a.phase === 'step');

  return (
    <div
      onClick={() => selectElement(element.id)}
      className={`flex items-center gap-2 px-2 py-1.5 rounded mt-1 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-od-accent/20 ring-1 ring-od-accent'
          : 'hover:bg-od-surface-light/50'
      }`}
    >
      {/* Type badge */}
      <span className={`${typeInfo.bg} text-white text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0`}>
        {typeInfo.label}
      </span>

      {/* Title */}
      <span className="text-sm text-od-text flex-1 truncate">
        {element.title || 'Untitled'}
      </span>

      {/* Duration */}
      {element.duration_sec && (
        <span className="text-od-text-dim text-xs font-mono shrink-0">
          {element.duration_sec}s
        </span>
      )}

      {/* CUE button */}
      {cueActions.length > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); cueElement(element.id); }}
          className="px-2 py-0.5 bg-od-accent text-white text-[10px] font-bold rounded hover:bg-blue-500 transition-colors shrink-0"
        >
          CUE
        </button>
      )}

      {/* Step buttons */}
      {stepActions.map((action) => (
        <button
          key={action.id}
          onClick={(e) => {
            e.stopPropagation();
            if (action.step_label) executeStep(element.id, action.step_label);
          }}
          className={`px-2 py-0.5 text-white text-[10px] font-bold rounded transition-colors shrink-0 ${
            stepColorMap[action.step_color || 'blue'] || 'bg-blue-600 hover:bg-blue-500'
          }`}
          title={action.step_hotkey || undefined}
        >
          {action.step_label || 'STEP'}
          {action.step_hotkey && (
            <span className="ml-1 opacity-60">{action.step_hotkey}</span>
          )}
        </button>
      ))}
    </div>
  );
}
