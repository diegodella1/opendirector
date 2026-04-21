'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { appPath } from '@/lib/app-path';

interface ReleaseInfo {
  updateAvailable: boolean;
  version: string | null;
  downloadUrl: string | null;
  releaseNotes: string | null;
  mandatory: boolean;
}

export default function DownloadPage() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(appPath('/api/automator/update-check?currentVersion=0.0.0'))
      .then((res) => {
        if (!res.ok) throw new Error('Failed to check for releases');
        return res.json();
      })
      .then(setRelease)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const silentCmd = `msiexec /i OpenDirector-Automator_${release?.version || 'X.Y.Z'}_x64_en-US.msi /quiet`;

  const copyCommand = () => {
    navigator.clipboard.writeText(silentCmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-8">
      <header className="mb-10">
        <Link href="/" className="text-od-accent hover:underline text-sm mb-4 inline-block">
          &larr; Back to shows
        </Link>
        <h1 className="text-3xl font-bold text-white">Download Automator</h1>
        <p className="text-od-text-dim mt-2">
          Desktop app that connects to vMix and executes your rundown in real-time.
        </p>
      </header>

      {loading && (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-2 border-od-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-od-text-dim mt-4">Checking for releases...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && (!release || !release.version) && (
        <div className="text-center py-16 bg-od-surface border border-od-surface-light rounded-lg">
          <p className="text-xl text-white mb-2">No release available yet</p>
          <p className="text-od-text-dim">
            The first release will appear here once built via GitHub Actions.
          </p>
        </div>
      )}

      {!loading && !error && release?.version && (
        <div className="space-y-6">
          {/* Download Card */}
          <div className="bg-od-surface border border-od-surface-light rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  OpenDirector Automator v{release.version}
                </h2>
                <p className="text-od-text-dim text-sm mt-1">Windows installer (MSI)</p>
              </div>
              <span className="px-3 py-1 bg-od-accent/20 text-od-accent rounded-full text-sm font-medium">
                Latest
              </span>
            </div>

            <a
              href={appPath('/api/automator/download')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-od-accent text-white rounded-lg hover:bg-blue-500 transition-colors font-medium text-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download MSI
            </a>
          </div>

          {/* Release Notes */}
          {release.releaseNotes && (
            <div className="bg-od-surface border border-od-surface-light rounded-lg p-6">
              <h3 className="text-white font-medium mb-3">Release Notes</h3>
              <div className="text-od-text text-sm whitespace-pre-wrap leading-relaxed">
                {release.releaseNotes}
              </div>
            </div>
          )}

          {/* Requirements */}
          <div className="bg-od-surface border border-od-surface-light rounded-lg p-6">
            <h3 className="text-white font-medium mb-3">System Requirements</h3>
            <ul className="space-y-2 text-od-text text-sm">
              <li className="flex items-center gap-2">
                <span className="text-od-accent">&#10003;</span>
                Windows 10 or later (64-bit)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-od-accent">&#10003;</span>
                vMix (any edition) running on the same machine or network
              </li>
              <li className="flex items-center gap-2">
                <span className="text-od-accent">&#10003;</span>
                Microsoft Edge WebView2 Runtime (included in Windows 10 21H2+)
              </li>
            </ul>
          </div>

          {/* Silent Install */}
          <div className="bg-od-surface border border-od-surface-light rounded-lg p-6">
            <h3 className="text-white font-medium mb-3">Silent Install (IT/Automation)</h3>
            <div className="relative">
              <pre className="bg-od-bg-dark rounded p-3 text-sm text-od-text overflow-x-auto">
                {silentCmd}
              </pre>
              <button
                onClick={copyCommand}
                className="absolute top-2 right-2 px-2 py-1 text-xs bg-od-surface-light text-od-text-dim rounded hover:text-white transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
