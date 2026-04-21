'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { appPath, appWsUrl } from '@/lib/app-path';
import type { PrompterConfig, Signal } from '@/lib/types';

interface BlockScript {
  id: string;
  name: string;
  position: number;
  script: string;
}

// IndexedDB helpers for offline cache
const DB_NAME = 'od-prompter';
const STORE_NAME = 'scripts';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheScripts(showId: string, scripts: BlockScript[]) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(scripts, showId);
  } catch { /* ignore */ }
}

async function getCachedScripts(showId: string): Promise<BlockScript[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(showId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Signal display config
const SIGNAL_DISPLAY: Record<string, { text: string; color: string; blink: boolean }> = {
  countdown: { text: '', color: 'bg-yellow-500 text-black', blink: false },
  wrap: { text: 'WRAP', color: 'bg-red-600 text-white', blink: true },
  stretch: { text: 'STRETCH', color: 'bg-blue-500 text-white', blink: false },
  standby: { text: 'STANDBY', color: 'bg-yellow-500 text-black', blink: false },
  go: { text: 'GO', color: 'bg-green-500 text-white', blink: false },
  custom: { text: '', color: 'bg-purple-600 text-white', blink: false },
};

export default function PrompterPage() {
  const params = useParams();
  const showId = params.id as string;
  const containerRef = useRef<HTMLDivElement>(null);

  const [scripts, setScripts] = useState<BlockScript[]>([]);
  const [showName, setShowName] = useState('');
  const [scrollSpeed, setScrollSpeed] = useState(0);
  const [fontSize, setFontSize] = useState(48);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMirrored, setIsMirrored] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [activeSignal, setActiveSignal] = useState<Signal | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [scrollSyncMode, setScrollSyncMode] = useState<'off' | 'master' | 'follower'>('off');
  const wsRef = useRef<WebSocket | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Config from DB
  const [config, setConfig] = useState<PrompterConfig | null>(null);

  // Load scripts + config
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(appPath(`/api/shows/${showId}/rundown`));
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        setShowName(data.show.name);

        const blockScripts = data.blocks
          .filter((b: BlockScript) => b.script)
          .map((b: BlockScript) => ({
            id: b.id,
            name: b.name,
            position: b.position,
            script: b.script,
          }));
        setScripts(blockScripts);
        cacheScripts(showId, blockScripts);

        // Apply prompter config
        if (data.prompter_config) {
          setConfig(data.prompter_config);
          setFontSize(data.prompter_config.font_size || 48);
          setScrollSpeed(0);
        }
        setIsOffline(false);
      } catch {
        // Try IndexedDB cache
        const cached = await getCachedScripts(showId);
        if (cached) {
          setScripts(cached);
          setIsOffline(true);
        }
      }
    };
    load();
  }, [showId]);

  // WebSocket for live script updates + signals + scroll sync
  useEffect(() => {
    const ws = new WebSocket(appWsUrl('/ws'));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', payload: { showId } }));
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      // Script updates
      if (msg.channel === 'rundown' && msg.type === 'block_updated' && msg.payload.changes.script !== undefined) {
        setScripts((prev) =>
          prev.map((s) =>
            s.id === msg.payload.blockId
              ? { ...s, script: msg.payload.changes.script }
              : s
          )
        );
      }

      // Signals
      if (msg.channel === 'signals' && msg.type === 'signal') {
        const signal = msg.payload as Signal;
        setActiveSignal(signal);

        if (signal.type === 'countdown' && signal.value) {
          // Clear any previous countdown timer
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          let sec = parseInt(signal.value, 10);
          setCountdown(sec);
          countdownTimerRef.current = setInterval(() => {
            sec--;
            if (sec <= 0) {
              clearInterval(countdownTimerRef.current!);
              countdownTimerRef.current = null;
              setActiveSignal(null);
              setCountdown(null);
            } else {
              setCountdown(sec);
            }
          }, 1000);
        } else if (signal.type === 'go') {
          setTimeout(() => setActiveSignal(null), 3000);
        } else if (signal.type !== 'wrap') {
          setTimeout(() => setActiveSignal(null), 10000);
        }
      }

      if (msg.channel === 'signals' && msg.type === 'signals_cleared') {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setActiveSignal(null);
        setCountdown(null);
      }

      // Config updates
      if (msg.channel === 'prompter' && msg.type === 'config_updated') {
        setConfig(msg.payload);
        if (msg.payload.font_size) setFontSize(msg.payload.font_size);
      }

      // Scroll sync (follower receives)
      if (msg.channel === 'prompter' && msg.type === 'scroll_sync') {
        if (containerRef.current && scrollSyncMode === 'follower') {
          containerRef.current.scrollTop = msg.payload.scrollTop;
        }
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [showId, scrollSyncMode]);

  // Auto-scroll + master sync broadcast
  useEffect(() => {
    if (scrollSpeed === 0) return;
    let syncCounter = 0;
    const interval = setInterval(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop += scrollSpeed;
        // Broadcast scroll position to followers (every 5 frames to reduce traffic)
        syncCounter++;
        if (scrollSyncMode === 'master' && syncCounter % 5 === 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            channel: 'prompter',
            type: 'scroll_sync',
            timestamp: new Date().toISOString(),
            payload: { scrollTop: containerRef.current.scrollTop },
          }));
        }
      }
    }, 1000 / 60);
    return () => clearInterval(interval);
  }, [scrollSpeed, scrollSyncMode]);

  // Wake lock — keep screen on while scrolling
  useEffect(() => {
    if (scrollSpeed === 0 || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [scrollSpeed]);

  // Keyboard controls
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        setScrollSpeed((prev) => (prev > 0 ? 0 : config?.default_scroll_speed || 2));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setScrollSpeed((prev) => Math.max(0, prev - 0.5));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setScrollSpeed((prev) => Math.min(10, prev + 0.5));
        break;
      case '+':
      case '=':
        setFontSize((prev) => Math.min(120, prev + 4));
        break;
      case '-':
        setFontSize((prev) => Math.max(16, prev - 4));
        break;
      case 'f':
      case 'F':
        if (!e.ctrlKey && !e.metaKey) {
          if (document.fullscreenElement) {
            document.exitFullscreen();
            setIsFullscreen(false);
          } else {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
          }
        }
        break;
      case 'm':
      case 'M':
        if (!e.ctrlKey && !e.metaKey) {
          setIsMirrored((prev) => !prev);
        }
        break;
      case 'c':
      case 'C':
        if (!e.ctrlKey && !e.metaKey) {
          setShowConfig((prev) => !prev);
        }
        break;
    }
  }, [config]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Save config
  const saveConfig = async (updates: Partial<PrompterConfig>) => {
    await fetch(appPath(`/api/shows/${showId}/prompter-config`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  };

  // Render script text with markup
  const renderScript = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.trim() === '[PAUSA]') {
        return (
          <div key={i} className="my-8 text-center">
            <span className="text-yellow-400 text-lg tracking-widest">---  PAUSA  ---</span>
          </div>
        );
      }

      const vtrMatch = line.match(/^\[VTR:\s*(.+)\]$/);
      if (vtrMatch) {
        return (
          <div key={i} className="my-4 py-2 px-4 bg-purple-900/30 border-l-4 border-purple-500 rounded">
            <span className="text-purple-300">VTR: {vtrMatch[1]}</span>
          </div>
        );
      }

      if (line.trim().startsWith('(') && line.trim().endsWith(')')) {
        return (
          <p key={i} className="text-gray-500 italic" style={{ fontSize: fontSize * 0.6 }}>
            {line}
          </p>
        );
      }

      if (line.trim() === '---') {
        return <hr key={i} className="border-gray-600 my-6" />;
      }

      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className="leading-relaxed">
          {parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={j} className="text-white font-bold">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return <span key={j}>{part}</span>;
          })}
        </p>
      );
    });
  };

  const guidePos = config?.guide_position ?? 33;
  const textColor = config?.color_text || '#ffffff';
  const bgColor = config?.color_bg || '#000000';
  const marginPct = config?.margin_percent ?? 15;

  return (
    <div
      className="h-screen flex flex-col"
      style={{
        backgroundColor: bgColor,
        color: textColor,
        transform: isMirrored ? 'scaleX(-1)' : 'none',
      }}
    >
      {/* Offline banner */}
      {isOffline && (
        <div className="bg-yellow-600 text-black text-center py-1 text-sm font-bold shrink-0"
          style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}>
          OFFLINE — Using cached scripts
        </div>
      )}

      {/* Signal overlay */}
      {activeSignal && (
        <div
          className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-6 ${
            SIGNAL_DISPLAY[activeSignal.type]?.color || 'bg-gray-600 text-white'
          } ${SIGNAL_DISPLAY[activeSignal.type]?.blink ? 'animate-pulse' : ''}`}
          style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}
        >
          <span className="text-4xl font-black tracking-wider">
            {activeSignal.type === 'countdown' && countdown !== null
              ? `${countdown}s`
              : activeSignal.type === 'custom'
              ? activeSignal.value
              : SIGNAL_DISPLAY[activeSignal.type]?.text || activeSignal.type.toUpperCase()}
          </span>
        </div>
      )}

      {/* Controls bar */}
      {!isFullscreen && (
        <div className="bg-gray-900 px-4 py-2 flex items-center justify-between text-sm shrink-0"
          style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}>
          <span className="text-gray-400">{showName} — Prompter</span>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">Speed: {scrollSpeed.toFixed(1)}</span>
            <span className="text-gray-400">Font: {fontSize}px</span>
            {isMirrored && <span className="text-cyan-400 text-xs">MIRROR</span>}
            <span className="text-gray-500 text-xs">
              Space=play | Arrows=speed | +/-=font | F=full | M=mirror | C=config
            </span>
          </div>
        </div>
      )}

      {/* Config panel */}
      {showConfig && (
        <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 shrink-0 grid grid-cols-5 gap-4 text-sm"
          style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Font Size</label>
            <input
              type="range" min={16} max={120} value={fontSize}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setFontSize(v);
                saveConfig({ font_size: v });
              }}
              className="w-full"
            />
            <span className="text-gray-400 text-xs">{fontSize}px</span>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Scroll Speed</label>
            <input
              type="range" min={0} max={10} step={0.5} value={config?.default_scroll_speed || 2}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                saveConfig({ default_scroll_speed: v });
              }}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Guide Position</label>
            <input
              type="range" min={10} max={80} value={guidePos}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                saveConfig({ guide_position: v });
              }}
              className="w-full"
            />
            <span className="text-gray-400 text-xs">{guidePos}%</span>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Margin</label>
            <input
              type="range" min={5} max={30} value={marginPct}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                saveConfig({ margin_percent: v });
              }}
              className="w-full"
            />
            <span className="text-gray-400 text-xs">{marginPct}%</span>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Scroll Sync</label>
            <button
              onClick={() => setScrollSyncMode(m => m === 'off' ? 'master' : m === 'master' ? 'follower' : 'off')}
              className={`px-3 py-1 rounded text-xs font-medium ${
                scrollSyncMode === 'off' ? 'bg-gray-700 text-gray-400' :
                scrollSyncMode === 'master' ? 'bg-blue-600 text-white' :
                'bg-green-600 text-white'
              }`}
            >
              {scrollSyncMode === 'off' ? 'OFF' : scrollSyncMode === 'master' ? 'MASTER' : 'FOLLOWER'}
            </button>
          </div>
        </div>
      )}

      {/* Guide line */}
      <div className="relative flex-1 overflow-hidden">
        <div
          className="absolute left-0 right-0 border-t border-red-500/30 pointer-events-none z-10"
          style={{ top: `${guidePos}%` }}
        />

        {/* Script content */}
        <div
          ref={containerRef}
          className="h-full overflow-y-auto"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: config?.line_height || 1.5,
            paddingLeft: `${marginPct}%`,
            paddingRight: `${marginPct}%`,
          }}
        >
          <div style={{ height: `${guidePos}vh` }} />

          {scripts.length === 0 ? (
            <p className="text-gray-600 text-center" style={{ fontSize: '24px' }}>
              No scripts in this show
            </p>
          ) : (
            scripts.map((block) => (
              <div key={block.id} className="mb-16">
                <div className="text-gray-600 text-sm uppercase tracking-widest mb-4" style={{ fontSize: '14px' }}>
                  {block.name}
                </div>
                {renderScript(block.script)}
              </div>
            ))
          )}

          <div style={{ height: `${100 - guidePos}vh` }} />
        </div>
      </div>
    </div>
  );
}
