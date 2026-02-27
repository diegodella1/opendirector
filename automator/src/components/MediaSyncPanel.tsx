import { useAutomatorStore } from '@/stores/automator-store';

export function MediaSyncPanel() {
  const { mediaSyncStatus, triggerMediaSync } = useAutomatorStore();

  const synced = mediaSyncStatus.filter((m) => m.status === 'synced').length;
  const total = mediaSyncStatus.length;
  const downloading = mediaSyncStatus.filter((m) => m.status === 'downloading');
  const errors = mediaSyncStatus.filter((m) => m.status === 'error');

  if (total === 0) {
    return (
      <div className="p-3 text-od-text-dim text-xs">No media files</div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium">
          Media {synced}/{total}
        </span>
        <button
          onClick={() => triggerMediaSync()}
          className="text-xs px-2 py-1 bg-od-surface-light text-od-text-dim rounded hover:text-white transition-colors"
        >
          Sync Now
        </button>
      </div>

      {/* Active downloads */}
      {downloading.map((m) => (
        <div key={m.id} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-od-text-dim truncate max-w-[200px]">{m.original_name}</span>
            <span className="text-od-accent">{Math.round((m.progress || 0) * 100)}%</span>
          </div>
          <div className="w-full h-1 bg-od-surface-light rounded-full overflow-hidden">
            <div
              className="h-full bg-od-accent rounded-full transition-all duration-300"
              style={{ width: `${(m.progress || 0) * 100}%` }}
            />
          </div>
        </div>
      ))}

      {/* Errors */}
      {errors.map((m) => (
        <div key={m.id} className="flex items-center justify-between text-xs">
          <span className="text-red-400 truncate max-w-[200px]">{m.original_name}</span>
          <span className="text-red-400">Error</span>
        </div>
      ))}
    </div>
  );
}
