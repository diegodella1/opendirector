'use client';

import { useState, useCallback, useRef } from 'react';
import { appPath } from '@/lib/app-path';

type MediaCategory = 'auto' | 'clip' | 'stinger' | 'graphic' | 'lower_third' | 'audio';

const CATEGORY_OPTIONS: { value: MediaCategory; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'clip', label: 'Clip' },
  { value: 'stinger', label: 'Stinger' },
  { value: 'graphic', label: 'Graphic' },
  { value: 'lower_third', label: 'Lower Third' },
  { value: 'audio', label: 'Audio' },
];

interface MediaUploadProps {
  showId: string;
  onUploadComplete: () => void;
}

export default function MediaUpload({ showId, onUploadComplete }: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [category, setCategory] = useState<MediaCategory>('auto');
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setProgress(`Uploading ${file.name}...`);

    const formData = new FormData();
    formData.append('file', file);
    if (category !== 'auto') {
      formData.append('category', category);
    }

    try {
      const res = await fetch(appPath(`/api/shows/${showId}/media`), {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setProgress(`Uploaded ${file.name}`);
        onUploadComplete();
      } else {
        const err = await res.json();
        setProgress(`Error: ${err.error}`);
      }
    } catch (e) {
      setProgress(`Upload failed: ${e}`);
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(''), 3000);
    }
  }, [showId, onUploadComplete, category]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  }, [uploadFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  return (
    <div>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as MediaCategory)}
        className="w-full mb-2 px-2 py-1.5 text-xs bg-od-surface border border-od-surface-light rounded text-white focus:outline-none focus:border-od-accent"
      >
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragOver
            ? 'border-od-accent bg-od-accent/10'
            : 'border-od-surface-light hover:border-od-accent/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          onChange={handleFileSelect}
          accept="video/*,audio/*,image/*"
          className="hidden"
        />
        {uploading ? (
          <p className="text-od-accent text-sm">{progress}</p>
        ) : (
          <p className="text-od-text-dim text-sm">
            Drop media file here or click to browse
          </p>
        )}
      </div>
      {progress && !uploading && (
        <p className="text-od-text-dim text-xs mt-1">{progress}</p>
      )}
    </div>
  );
}
