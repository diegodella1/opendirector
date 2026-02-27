import { useAutomatorStore } from '@/stores/automator-store';

export function StatusBar() {
  const { show, vmixConnected, wsConnected, vmixHost, vmixPort } = useAutomatorStore();

  return (
    <div className="bg-od-surface border-b border-od-surface-light px-4 py-1.5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-white font-semibold">{show?.name || 'No Show'}</span>
        <span className="text-xs uppercase px-2 py-0.5 rounded bg-od-surface-light text-od-text-dim">
          {show?.status || '-'}
        </span>
        <span className="text-xs text-od-text-dim">v{show?.version || 0}</span>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className={`flex items-center gap-1.5 ${vmixConnected ? 'text-green-400' : 'text-red-400'}`}>
          <span className={`w-2 h-2 rounded-full ${vmixConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          vMix {vmixHost}:{vmixPort}
        </span>
        <span className={`flex items-center gap-1.5 ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
          <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          Server WS
        </span>
      </div>
    </div>
  );
}
