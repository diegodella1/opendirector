import { useState } from 'react';
import { useAutomatorStore } from '@/stores/automator-store';
import type { Show } from '@/lib/types';

const statusDot: Record<string, string> = {
  draft: 'bg-gray-400',
  ready: 'bg-blue-400',
  rehearsal: 'bg-yellow-400',
  live: 'bg-red-500 animate-pulse',
  archived: 'bg-gray-600',
};

export function TabBar() {
  const { tabs, activeTabId, switchTab, closeTab, openTab, shows } = useAutomatorStore();
  const [showPicker, setShowPicker] = useState(false);

  const tabEntries = Array.from(tabs.entries());
  const openShowIds = new Set(tabEntries.map(([id]) => id));
  const availableShows = shows.filter((s: Show) => !openShowIds.has(s.id));

  return (
    <div className="bg-od-surface border-b border-od-surface-light flex items-center px-1 shrink-0 h-9 gap-0.5 overflow-x-auto">
      {tabEntries.map(([showId, tab]) => {
        const isActive = showId === activeTabId;
        const dot = statusDot[tab.show.status] || 'bg-gray-400';
        return (
          <div
            key={showId}
            onClick={() => switchTab(showId)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-t cursor-pointer text-xs transition-colors select-none ${
              isActive
                ? 'bg-od-bg text-white border-t-2 border-t-od-accent border-x border-x-od-surface-light'
                : 'text-od-text-dim hover:text-white hover:bg-od-surface-light/50'
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
            <span className="truncate max-w-[140px]">{tab.show.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(showId); }}
              className="ml-1 text-od-text-dim hover:text-red-400 transition-colors"
              title="Close tab"
            >
              x
            </button>
          </div>
        );
      })}

      {/* Add tab button */}
      <div className="relative">
        <button
          onClick={() => {
            useAutomatorStore.getState().loadShows();
            setShowPicker(!showPicker);
          }}
          className="px-2 py-1 text-od-text-dim hover:text-white text-sm transition-colors"
          title="Open another show"
        >
          +
        </button>
        {showPicker && (
          <div className="absolute top-8 left-0 z-50 bg-od-surface border border-od-surface-light rounded shadow-lg min-w-[200px]">
            {availableShows.length === 0 ? (
              <div className="px-3 py-2 text-xs text-od-text-dim">No more shows</div>
            ) : (
              availableShows.map((s: Show) => (
                <button
                  key={s.id}
                  onClick={() => {
                    openTab(s.id);
                    setShowPicker(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-od-text hover:bg-od-surface-light/50 flex items-center gap-2"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[s.status] || 'bg-gray-400'}`} />
                  {s.name}
                  <span className="text-od-text-dim ml-auto">{s.status}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
