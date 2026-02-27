'use client';

import { useState } from 'react';

interface SignalPanelProps {
  showId: string;
  onSendSignal: (type: string, value?: string) => void;
  onClearSignals: () => void;
}

const SIGNAL_BUTTONS = [
  { type: 'countdown', value: '30', label: '30s', color: 'bg-yellow-600 hover:bg-yellow-500' },
  { type: 'countdown', value: '60', label: '1min', color: 'bg-yellow-600 hover:bg-yellow-500' },
  { type: 'wrap', label: 'WRAP', color: 'bg-red-600 hover:bg-red-500' },
  { type: 'stretch', label: 'STRETCH', color: 'bg-blue-600 hover:bg-blue-500' },
  { type: 'standby', label: 'STANDBY', color: 'bg-yellow-600 hover:bg-yellow-500' },
  { type: 'go', label: 'GO', color: 'bg-green-600 hover:bg-green-500' },
];

export default function SignalPanel({ onSendSignal, onClearSignals }: SignalPanelProps) {
  const [customMessage, setCustomMessage] = useState('');

  const sendCustom = () => {
    if (!customMessage.trim()) return;
    onSendSignal('custom', customMessage.trim());
    setCustomMessage('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-od-text-dim uppercase tracking-wider">
          Signals to Talent
        </h3>
        <button
          onClick={onClearSignals}
          className="text-xs px-2 py-1 text-red-400 hover:bg-red-500/20 rounded transition-colors"
        >
          Clear All
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SIGNAL_BUTTONS.map((btn) => (
          <button
            key={`${btn.type}-${btn.value || ''}`}
            onClick={() => onSendSignal(btn.type, btn.value)}
            className={`${btn.color} text-white text-sm font-bold py-3 rounded-lg transition-colors active:scale-95`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendCustom()}
          placeholder="Custom message..."
          className="flex-1 px-3 py-2 bg-od-bg-dark border border-od-surface-light rounded text-sm text-white placeholder-od-text-dim focus:outline-none focus:border-od-accent"
        />
        <button
          onClick={sendCustom}
          className="px-4 py-2 bg-od-accent text-white rounded text-sm hover:bg-blue-500 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
