'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { appPath } from '@/lib/app-path';

interface ReleaseInfo {
  version: string | null;
  downloadUrl: string | null;
}

const dismissedVersionKey = 'opendirector.automatorUpdate.dismissedVersion';

export default function AutomatorUpdateNotice() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(appPath('/api/automator/update-check?currentVersion=0.0.0'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ReleaseInfo | null) => {
        if (cancelled || !data?.version || !data.downloadUrl) return;

        const dismissedVersion = window.localStorage.getItem(dismissedVersionKey);
        if (dismissedVersion !== data.version) {
          setRelease(data);
          setVisible(true);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible || !release?.version) return null;

  const dismiss = () => {
    window.localStorage.setItem(dismissedVersionKey, release.version ?? '');
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-od-accent/40 bg-od-surface shadow-xl">
      <div className="flex items-start gap-4 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Automator v{release.version} available</p>
          <p className="mt-1 text-sm text-od-text-dim">Update the operator PC before the next show.</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-od-text-dim hover:text-white"
          aria-label="Dismiss Automator update notice"
        >
          x
        </button>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-od-surface-light px-4 py-3">
        <button
          type="button"
          onClick={dismiss}
          className="px-3 py-1.5 text-sm text-od-text-dim hover:text-white"
        >
          Later
        </button>
        <Link
          href={appPath('/download')}
          className="rounded bg-od-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          Download
        </Link>
      </div>
    </div>
  );
}
