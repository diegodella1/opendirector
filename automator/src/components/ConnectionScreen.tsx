import { useState, useEffect } from 'react';
import { useAutomatorStore } from '@/stores/automator-store';
import type { Show } from '@/lib/types';

export function ConnectionScreen() {
  const { serverUrl, vmixHost, vmixPort, setServerUrl, setVmixHost, setVmixPort, loadShows, shows, connectToShow, connectToVmix } = useAutomatorStore();
  const [selectedShowId, setSelectedShowId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadShows();
  }, [loadShows]);

  const handleConnect = async () => {
    if (!selectedShowId) {
      setError('Select a show');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await connectToVmix();
      await connectToShow(selectedShowId);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-od-bg">
      <div className="bg-od-surface border border-od-surface-light rounded-xl p-8 w-[480px]">
        <h1 className="text-2xl font-bold text-white mb-1">OpenDirector</h1>
        <p className="text-od-text-dim text-sm mb-6">Automator</p>

        {/* Server URL */}
        <label className="block text-xs text-od-text-dim uppercase tracking-wider mb-1">Server URL</label>
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => { setServerUrl(e.target.value); }}
          onBlur={() => loadShows()}
          className="w-full px-3 py-2 bg-od-bg border border-od-surface-light rounded text-white text-sm mb-4 focus:outline-none focus:border-od-accent"
        />

        {/* Show Selector */}
        <label className="block text-xs text-od-text-dim uppercase tracking-wider mb-1">Show</label>
        <select
          value={selectedShowId}
          onChange={(e) => setSelectedShowId(e.target.value)}
          className="w-full px-3 py-2 bg-od-bg border border-od-surface-light rounded text-white text-sm mb-4 focus:outline-none focus:border-od-accent"
        >
          <option value="">-- Select show --</option>
          {shows.map((s: Show) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.status}) v{s.version}
            </option>
          ))}
        </select>

        {/* vMix Connection */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-od-text-dim uppercase tracking-wider mb-1">vMix Host</label>
            <input
              type="text"
              value={vmixHost}
              onChange={(e) => setVmixHost(e.target.value)}
              className="w-full px-3 py-2 bg-od-bg border border-od-surface-light rounded text-white text-sm focus:outline-none focus:border-od-accent"
            />
          </div>
          <div className="w-24">
            <label className="block text-xs text-od-text-dim uppercase tracking-wider mb-1">Port</label>
            <input
              type="number"
              value={vmixPort}
              onChange={(e) => setVmixPort(parseInt(e.target.value) || 8099)}
              className="w-full px-3 py-2 bg-od-bg border border-od-surface-light rounded text-white text-sm focus:outline-none focus:border-od-accent"
            />
          </div>
        </div>

        {error && (
          <p className="text-od-tally-pgm text-sm mb-4">{error}</p>
        )}

        <button
          onClick={handleConnect}
          disabled={loading}
          className="w-full py-3 bg-od-accent text-white rounded-lg font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
