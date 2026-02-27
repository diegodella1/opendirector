import { useAutomatorStore } from '@/stores/automator-store';

const resultColors: Record<string, string> = {
  ok: 'text-green-400',
  error: 'text-od-tally-pgm',
  pending: 'text-od-warning',
};

export function ExecutionLog() {
  const { executionLog } = useAutomatorStore();

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-3 py-1.5 border-b border-od-surface-light shrink-0">
        <h3 className="text-[10px] uppercase tracking-widest text-od-text-dim font-medium">
          Execution Log ({executionLog.length})
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-1 font-mono text-xs">
        {executionLog.length === 0 ? (
          <p className="text-od-text-dim py-2">No events yet</p>
        ) : (
          executionLog.map((entry) => (
            <div key={entry.id} className="flex gap-2 py-0.5 border-b border-od-surface-light/30">
              <span className="text-od-text-dim shrink-0">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className={`shrink-0 uppercase font-bold ${resultColors[entry.result] || 'text-od-text'}`}>
                {entry.result === 'ok' ? 'OK' : entry.result === 'error' ? 'ER' : '..'}
              </span>
              <span className="text-od-text-dim shrink-0">{entry.type}</span>
              <span className="text-od-text truncate">
                {entry.elementTitle || entry.message || ''}
              </span>
              {entry.vmixFunction && (
                <span className="text-od-accent shrink-0">{entry.vmixFunction}</span>
              )}
              {entry.latencyMs !== undefined && (
                <span className="text-od-text-dim shrink-0">{entry.latencyMs}ms</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
