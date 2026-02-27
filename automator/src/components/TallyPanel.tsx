import { useAutomatorStore } from '@/stores/automator-store';

export function TallyPanel() {
  const { tally, vmixConnected } = useAutomatorStore();

  return (
    <div className="w-48 border-r border-od-surface-light p-3 shrink-0">
      <h3 className="text-[10px] uppercase tracking-widest text-od-text-dim mb-3 font-medium">Tally</h3>

      {!vmixConnected ? (
        <p className="text-od-text-dim text-xs">vMix not connected</p>
      ) : (
        <div className="space-y-3">
          {/* Program */}
          <div>
            <span className="text-[10px] uppercase text-od-text-dim">PGM</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-3 h-3 rounded-sm bg-od-tally-pgm shrink-0" />
              <span className="text-white text-sm font-medium truncate">
                {tally.program || '—'}
              </span>
            </div>
          </div>

          {/* Preview */}
          <div>
            <span className="text-[10px] uppercase text-od-text-dim">PVW</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-3 h-3 rounded-sm bg-od-tally-pvw shrink-0" />
              <span className="text-od-text text-sm truncate">
                {tally.preview || '—'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
