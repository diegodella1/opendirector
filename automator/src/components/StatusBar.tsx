import { useAutomatorStore } from '@/stores/automator-store';

export function StatusBar() {
  const { show, vmixConnected, wsConnected, vmixHost, vmixPort, mediaSyncStatus, executionMode, setExecutionMode, currentClipPool, tally } = useAutomatorStore();
  const mediaSynced = mediaSyncStatus.filter(m => m.status === 'synced').length;
  const mediaTotal = mediaSyncStatus.length;
  const allSynced = mediaTotal > 0 && mediaSynced === mediaTotal;
  const hasDownloading = mediaSyncStatus.some(m => m.status === 'downloading');

  return (
    <div className="bg-od-surface border-b border-od-surface-light px-4 py-1.5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-white font-semibold">{show?.name || 'No Show'}</span>
        <span className={`text-xs uppercase px-2 py-0.5 rounded font-bold ${
          show?.status === 'live' ? 'bg-red-600 text-white animate-pulse' :
          show?.status === 'rehearsal' ? 'bg-yellow-600 text-black' :
          'bg-od-surface-light text-od-text-dim'
        }`}>
          {show?.status || '-'}
        </span>
        <span className="text-xs text-od-text-dim">v{show?.version || 0}</span>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <button
          onClick={() => setExecutionMode(executionMode === 'auto' ? 'manual' : 'auto')}
          title={executionMode === 'auto' ? 'AUTO: CUE commands execute automatically' : 'MANUAL: CUE commands require operator confirmation'}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors ${
            executionMode === 'auto'
              ? 'bg-green-600/30 text-green-400 border-green-600/50 hover:bg-green-600/40'
              : 'bg-od-surface-light text-od-text-dim border-od-surface-light hover:bg-od-surface-light/80'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${executionMode === 'auto' ? 'bg-green-400' : 'bg-gray-500'}`} />
          {executionMode === 'auto' ? 'AUTO' : 'MANUAL'}
        </button>
        <span className={`flex items-center gap-1.5 ${vmixConnected ? 'text-green-400' : 'text-red-400'}`}>
          <span className={`w-2 h-2 rounded-full ${vmixConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          vMix {vmixHost}:{vmixPort}
        </span>
        <span className={`flex items-center gap-1.5 ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          Server WS
        </span>
        <span className={`px-2 py-0.5 rounded font-bold text-xs ${
          currentClipPool === 'a' ? 'bg-blue-600/30 text-blue-400' : 'bg-orange-600/30 text-orange-400'
        }`}>
          POOL {currentClipPool.toUpperCase()}
        </span>
        {tally.recording && (
          <span className="px-2 py-0.5 rounded font-bold text-xs bg-red-600 text-white animate-pulse">
            REC
          </span>
        )}
        {tally.streaming && (
          <span className="px-2 py-0.5 rounded font-bold text-xs bg-blue-600 text-white">
            STREAM
          </span>
        )}
        {mediaTotal > 0 && (
          <span className={`flex items-center gap-1.5 ${allSynced ? 'text-green-400' : 'text-yellow-400'}`}>
            <span className={`w-2 h-2 rounded-full ${allSynced ? 'bg-green-400' : 'bg-yellow-400'} ${hasDownloading ? 'animate-pulse' : ''}`} />
            Media {mediaSynced}/{mediaTotal}
          </span>
        )}
      </div>
    </div>
  );
}
