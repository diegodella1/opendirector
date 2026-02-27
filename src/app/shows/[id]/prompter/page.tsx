'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

interface BlockScript {
  id: string;
  name: string;
  position: number;
  script: string;
}

export default function PrompterPage() {
  const params = useParams();
  const showId = params.id as string;
  const containerRef = useRef<HTMLDivElement>(null);

  const [scripts, setScripts] = useState<BlockScript[]>([]);
  const [showName, setShowName] = useState('');
  const [scrollSpeed, setScrollSpeed] = useState(0); // 0 = paused
  const [fontSize, setFontSize] = useState(48);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load scripts from rundown
  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/shows/${showId}/rundown`);
      if (!res.ok) return;
      const data = await res.json();
      setShowName(data.show.name);
      setScripts(
        data.blocks
          .filter((b: BlockScript) => b.script)
          .map((b: BlockScript) => ({
            id: b.id,
            name: b.name,
            position: b.position,
            script: b.script,
          }))
      );
    };
    load();
  }, [showId]);

  // WebSocket for live script updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

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

      if (msg.channel === 'rundown' && msg.type === 'block_updated' && msg.payload.changes.script !== undefined) {
        setScripts((prev) =>
          prev.map((s) =>
            s.id === msg.payload.blockId
              ? { ...s, script: msg.payload.changes.script }
              : s
          )
        );
      }
    };

    return () => ws.close();
  }, [showId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollSpeed === 0) return;

    const interval = setInterval(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop += scrollSpeed;
      }
    }, 1000 / 60); // 60fps

    return () => clearInterval(interval);
  }, [scrollSpeed]);

  // Keyboard controls
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        setScrollSpeed((prev) => (prev > 0 ? 0 : 2));
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
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Render script text with markup
  const renderScript = (text: string) => {
    return text.split('\n').map((line, i) => {
      // [PAUSA] markers
      if (line.trim() === '[PAUSA]') {
        return (
          <div key={i} className="my-8 text-center">
            <span className="text-yellow-400 text-lg tracking-widest">---  PAUSA  ---</span>
          </div>
        );
      }

      // [VTR: name] markers
      const vtrMatch = line.match(/^\[VTR:\s*(.+)\]$/);
      if (vtrMatch) {
        return (
          <div key={i} className="my-4 py-2 px-4 bg-purple-900/30 border-l-4 border-purple-500 rounded">
            <span className="text-purple-300">VTR: {vtrMatch[1]}</span>
          </div>
        );
      }

      // (instructions) in grey
      if (line.trim().startsWith('(') && line.trim().endsWith(')')) {
        return (
          <p key={i} className="text-gray-500 italic" style={{ fontSize: fontSize * 0.6 }}>
            {line}
          </p>
        );
      }

      // --- separator
      if (line.trim() === '---') {
        return <hr key={i} className="border-gray-600 my-6" />;
      }

      // Regular text (bold handling)
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

  return (
    <div className="h-screen bg-black text-white flex flex-col">
      {/* Controls bar (hidden in fullscreen) */}
      {!isFullscreen && (
        <div className="bg-gray-900 px-4 py-2 flex items-center justify-between text-sm shrink-0">
          <span className="text-gray-400">{showName} — Prompter</span>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">
              Speed: {scrollSpeed.toFixed(1)}
            </span>
            <span className="text-gray-400">
              Font: {fontSize}px
            </span>
            <span className="text-gray-500 text-xs">
              Space=play/pause | Arrows=speed | +/-=font | F=fullscreen
            </span>
          </div>
        </div>
      )}

      {/* Guide line at 1/3 */}
      <div className="relative flex-1 overflow-hidden">
        <div
          className="absolute left-0 right-0 border-t border-red-500/30 pointer-events-none z-10"
          style={{ top: '33%' }}
        />

        {/* Script content */}
        <div
          ref={containerRef}
          className="h-full overflow-y-auto px-[15%]"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}
        >
          {/* Top padding (so first line starts at guide) */}
          <div style={{ height: '33vh' }} />

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

          {/* Bottom padding (so last line reaches guide) */}
          <div style={{ height: '67vh' }} />
        </div>
      </div>
    </div>
  );
}
