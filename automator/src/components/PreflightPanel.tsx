import { useAutomatorStore, useActiveShowState } from '@/stores/automator-store';

export function PreflightPanel() {
  const { vmixConnected } = useAutomatorStore();
  const { preflightResults, preflightLoading, preflightError } = useActiveShowState();
  const runPreflight = useAutomatorStore(s => s.runPreflight);

  const errors = preflightResults?.filter(r => r.level === 'error') || [];
  const warnings = preflightResults?.filter(r => r.level === 'warning') || [];
  const oks = preflightResults?.filter(r => r.level === 'ok') || [];
  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

  return (
    <div className="border-t border-od-surface-light bg-od-bg">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-od-surface-light">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white">Pre-Flight Check</span>
          {preflightResults && !preflightLoading && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              hasErrors
                ? 'bg-red-500/20 text-red-400'
                : hasWarnings
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-green-500/20 text-green-400'
            }`}>
              {hasErrors
                ? `${errors.length} error${errors.length !== 1 ? 's' : ''}`
                : hasWarnings
                ? `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`
                : 'All OK'}
              {hasErrors && hasWarnings && `, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>
        <button
          onClick={() => runPreflight()}
          disabled={!vmixConnected || preflightLoading}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
            !vmixConnected
              ? 'bg-od-surface-light text-od-text-dim/50 cursor-not-allowed'
              : preflightLoading
              ? 'bg-od-accent/20 text-od-accent animate-pulse cursor-wait'
              : 'bg-od-surface-light text-od-text-dim hover:text-white hover:bg-od-surface-light/80'
          }`}
        >
          {preflightLoading ? 'Checking...' : preflightResults ? 'Re-check' : 'Run Check'}
        </button>
      </div>

      {preflightError && (
        <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20">
          <span className="text-[11px] text-red-400">{preflightError}</span>
        </div>
      )}

      {hasErrors && !preflightLoading && (
        <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
          <span className="text-[11px] text-red-400">
            {errors.length} missing input{errors.length !== 1 ? 's' : ''} in vMix -- fix before going live
          </span>
        </div>
      )}

      {preflightResults && !preflightLoading && (
        <div className="max-h-40 overflow-y-auto">
          {errors.map(check => (
            <CheckRow key={check.key} check={check} />
          ))}
          {warnings.map(check => (
            <CheckRow key={check.key} check={check} />
          ))}
          {oks.map(check => (
            <CheckRow key={check.key} check={check} />
          ))}
        </div>
      )}

      {!preflightResults && !preflightLoading && !preflightError && (
        <div className="px-3 py-2 text-od-text-dim text-[11px]">
          {vmixConnected
            ? 'Click "Run Check" to validate vMix inputs against the rundown.'
            : 'Connect to vMix first to run pre-flight checks.'}
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: { key: string; description: string; level: string; suggestion: string } }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1 hover:bg-od-surface-light/30 transition-colors">
      <div className="mt-0.5 flex-shrink-0">
        {check.level === 'ok' && (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-green-400">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
        )}
        {check.level === 'error' && (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-red-400">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
          </svg>
        )}
        {check.level === 'warning' && (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-yellow-400">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-[11px] ${
          check.level === 'error' ? 'text-red-300' :
          check.level === 'warning' ? 'text-yellow-300' :
          'text-od-text-dim'
        }`}>
          {check.description}
        </span>
        {check.suggestion && (
          <p className="text-[10px] text-od-text-dim/70 mt-0.5 truncate" title={check.suggestion}>
            {check.suggestion}
          </p>
        )}
      </div>
    </div>
  );
}
