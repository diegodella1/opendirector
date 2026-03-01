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
  const { selectedElementId, selectElement, cueElement, executeStep, requestedElementId, clearRequestedElement, clipPosition } = useAutomatorStore();
  const isSelected = selectedElementId === element.id;
  const isRequested = requestedElementId === element.id;
  const typeInfo = typeStyles[element.type] || { label: '?', bg: 'bg-gray-500' };

  const cueActions = element.actions.filter(a => a.phase === 'on_cue');
  const stepActions = element.actions.filter(a => a.phase === 'step');

  // Clip progress: show when this element's vMix input matches the currently playing clip
  const isClipPlaying = element.type === 'clip'
    && clipPosition
    && element.vmix_input_key
    && clipPosition.inputKey === element.vmix_input_key
    && clipPosition.durationMs > 0;

  const clipProgress = isClipPlaying
    ? Math.min(clipPosition.positionMs / clipPosition.durationMs, 1)
    : 0;

  // Timecode trigger marker position (as fraction 0-1)
  const triggerMarker = (() => {
    if (!isClipPlaying || element.trigger_type !== 'timecode' || !element.trigger_config) return null;
    const at = element.trigger_config.at;
    if (at == null) return null;
    const atMs = typeof at === 'string' ? parseInt(at, 10) : Number(at);
    if (isNaN(atMs)) return null;
    const dur = clipPosition.durationMs;
    const absMs = atMs >= 0 ? atMs : Math.max(0, dur + atMs);
    return Math.min(absMs / dur, 1);
  })();

  return (
    <div
      onClick={() => selectElement(element.id)}
      className={`relative flex items-center gap-2 px-2 py-1.5 rounded mt-1 cursor-pointer transition-colors ${
        isRequested
          ? 'bg-yellow-600/20 ring-1 ring-yellow-400 animate-pulse'
          : isSelected
          ? 'bg-od-accent/20 ring-1 ring-od-accent'
          : 'hover:bg-od-surface-light/50'
      }`}
    >
      {/* Clip progress bar (thin, at the bottom of the row) */}
      {isClipPlaying && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-od-surface-light/30 rounded-b overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-[width] duration-200 ease-linear"
            style={{ width: `${clipProgress * 100}%` }}
          />
          {/* Timecode trigger marker */}
          {triggerMarker !== null && (
            <div
              className="absolute top-0 h-full w-[2px] bg-yellow-400"
              style={{ left: `${triggerMarker * 100}%` }}
              title={`Trigger at ${Math.round((triggerMarker * clipPosition.durationMs) / 1000)}s`}
            />
          )}
        </div>
      )}

      {/* Type badge */}
      <span className={`${typeInfo.bg} text-white text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0`}>
        {typeInfo.label}
      </span>

      {/* Title */}
      <span className="text-sm text-od-text flex-1 truncate">
        {element.title || 'Untitled'}
      </span>

      {/* Duration / clip position */}
      {isClipPlaying ? (
        <span className="text-purple-400 text-xs font-mono shrink-0">
          {formatMs(clipPosition.positionMs)}/{formatMs(clipPosition.durationMs)}
        </span>
      ) : element.duration_sec ? (
        <span className="text-od-text-dim text-xs font-mono shrink-0">
          {element.duration_sec}s
        </span>
      ) : null}

      {/* CUE button */}
      {cueActions.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            cueElement(element.id);
            if (isRequested) clearRequestedElement();
          }}
          className={`px-2 py-0.5 text-white text-[10px] font-bold rounded transition-colors shrink-0 ${
            isRequested
              ? 'bg-yellow-500 hover:bg-yellow-400 animate-pulse'
              : 'bg-od-accent hover:bg-blue-500'
          }`}
        >
          {isRequested ? 'CUE!' : 'CUE'}
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

/** Format milliseconds as MM:SS */
function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
