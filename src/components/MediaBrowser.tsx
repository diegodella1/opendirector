'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MediaFile } from '@/lib/types';
import MediaUpload from './MediaUpload';

interface MediaBrowserProps {
  showId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDuration(sec: number | null): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MediaBrowser({ showId }: MediaBrowserProps) {
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMedia = useCallback(async () => {
    const res = await fetch(`/api/shows/${showId}/media`);
    if (res.ok) {
      setMedia(await res.json());
    }
    setLoading(false);
  }, [showId]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this media file?')) return;
    const res = await fetch(`/api/media/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setMedia((prev) => prev.filter((m) => m.id !== id));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-od-text-dim uppercase tracking-wider">
          Media ({media.length} files)
        </h3>
      </div>

      <MediaUpload showId={showId} onUploadComplete={fetchMedia} />

      {loading ? (
        <p className="text-od-text-dim text-sm mt-4">Loading media...</p>
      ) : media.length === 0 ? (
        <p className="text-od-text-dim text-sm mt-4 text-center py-4">
          No media files. Drag & drop or click to upload.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 mt-4">
          {media.map((m) => (
            <div
              key={m.id}
              className="bg-od-surface border border-od-surface-light rounded-lg overflow-hidden group"
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-od-bg-dark flex items-center justify-center relative">
                {m.thumbnail_path ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/shows/${showId}/media/thumb/${m.id}`}
                    alt={m.original_name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-od-text-dim text-2xl">
                    {m.mime_type.startsWith('video') ? '🎬' : m.mime_type.startsWith('audio') ? '🔊' : '📄'}
                  </span>
                )}
                {/* Compatibility badge */}
                <span className={`absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  m.vmix_compatible
                    ? 'bg-green-600/80 text-white'
                    : 'bg-orange-600/80 text-white'
                }`}>
                  {m.vmix_compatible ? 'vMix OK' : 'Warning'}
                </span>
              </div>

              {/* Info */}
              <div className="p-2">
                <p className="text-white text-xs font-medium truncate">{m.original_name}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-od-text-dim">
                  <span>{formatBytes(m.size_bytes)}</span>
                  {m.width && m.height && <span>{m.width}x{m.height}</span>}
                  <span>{formatDuration(m.duration_sec)}</span>
                  {m.codec && <span className="uppercase">{m.codec}</span>}
                </div>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-red-400/50 hover:text-red-400 text-xs mt-1 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
