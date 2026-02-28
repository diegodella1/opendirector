import { useState, useMemo } from 'react';
import { useAutomatorStore } from '@/stores/automator-store';
import type { MediaSyncState } from '@/lib/types';

// Category display config with simple SVG icons
const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  clips: { label: 'Clips', icon: 'M15.91 3.57 4.09 9.5V3.57h11.82zM3 2.5v19l17-9.5L3 2.5z' },
  stingers: { label: 'Stingers', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  graphics: { label: 'Graphics', icon: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z' },
  lower_thirds: { label: 'Lower Thirds', icon: 'M2 17h20v2H2v-2zm0-4h20v2H2v-2zm4-4h12v2H6V9z' },
  audio: { label: 'Audio', icon: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z' },
  other: { label: 'Other', icon: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z' },
};

// Map raw category values to folder keys
function categoryToFolder(cat?: string): string {
  switch (cat) {
    case 'clip': return 'clips';
    case 'stinger': return 'stingers';
    case 'graphic': return 'graphics';
    case 'lower_third': return 'lower_thirds';
    case 'audio': return 'audio';
    default: return 'other';
  }
}

function CategoryIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
      <path d={path} />
    </svg>
  );
}

function CategoryGroup({ folder, files }: { folder: string; files: MediaSyncState[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const config = CATEGORY_CONFIG[folder] || CATEGORY_CONFIG.other;
  const synced = files.filter((f) => f.status === 'synced').length;

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs hover:bg-od-surface-light/50 rounded transition-colors"
      >
        <span className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <CategoryIcon path={config.icon} />
        <span className="font-medium text-white flex-1 text-left">{config.label}</span>
        <span className="text-od-text-dim">
          {synced}/{files.length}
        </span>
      </button>

      {!collapsed && (
        <div className="ml-4 space-y-1 mt-0.5">
          {files.map((m) => (
            <div key={m.id} className="px-2 py-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-od-text-dim truncate max-w-[150px]">{m.original_name}</span>
                {m.status === 'synced' && (
                  <span className="text-green-400 text-[10px]">OK</span>
                )}
                {m.status === 'error' && (
                  <span className="text-red-400 text-[10px]" title={m.error}>ERR</span>
                )}
                {(m.status === 'downloading' || m.status === 'pending') && (
                  <span className="text-od-accent text-[10px]">
                    {Math.round((m.progress || 0) * 100)}%
                  </span>
                )}
              </div>
              {m.status === 'downloading' && (
                <div className="w-full h-0.5 bg-od-surface-light rounded-full overflow-hidden mt-0.5">
                  <div
                    className="h-full bg-od-accent rounded-full transition-all duration-300"
                    style={{ width: `${(m.progress || 0) * 100}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MediaSyncPanel() {
  const { mediaSyncStatus, triggerMediaSync } = useAutomatorStore();

  const grouped = useMemo(() => {
    const groups: Record<string, MediaSyncState[]> = {};
    for (const m of mediaSyncStatus) {
      const folder = categoryToFolder(m.category);
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(m);
    }
    return groups;
  }, [mediaSyncStatus]);

  const synced = mediaSyncStatus.filter((m) => m.status === 'synced').length;
  const total = mediaSyncStatus.length;

  // Category display order
  const orderedFolders = ['clips', 'stingers', 'graphics', 'lower_thirds', 'audio', 'other'];

  return (
    <div className="w-64 flex-shrink-0 border-l border-od-surface-light bg-od-bg overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-od-surface-light">
        <span className="text-xs font-medium text-white">
          Media {synced}/{total}
        </span>
        <button
          onClick={() => triggerMediaSync()}
          className="text-[10px] px-1.5 py-0.5 bg-od-surface-light text-od-text-dim rounded hover:text-white transition-colors"
        >
          Sync
        </button>
      </div>

      {total === 0 ? (
        <div className="p-3 text-od-text-dim text-xs">No media files</div>
      ) : (
        <div className="py-1">
          {orderedFolders.map((folder) => {
            const files = grouped[folder];
            if (!files || files.length === 0) return null;
            return <CategoryGroup key={folder} folder={folder} files={files} />;
          })}
        </div>
      )}
    </div>
  );
}
