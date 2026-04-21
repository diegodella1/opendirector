import { useEffect, useMemo, useState } from 'react';
import { useAutomatorStore } from '@/stores/automator-store';

type UpdateCheckResponse = {
  updateAvailable: boolean;
  version: string | null;
  downloadUrl: string | null;
  mandatory: boolean;
};

type UpdateState =
  | { status: 'idle' | 'checking' | 'hidden' }
  | { status: 'available'; version: string; downloadUrl: string; mandatory: boolean };

function normalizeServerUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

function resolveDownloadUrl(serverUrl: string, downloadUrl: string | null) {
  if (downloadUrl) return downloadUrl;
  return `${serverUrl}/api/automator/download`;
}

function getDismissedVersion() {
  try {
    return sessionStorage.getItem('od_updateDismissedVersion');
  } catch {
    return null;
  }
}

function setDismissedVersion(version: string) {
  try {
    sessionStorage.setItem('od_updateDismissedVersion', version);
  } catch {
    // noop
  }
}

export function AutomatorUpdatePrompt() {
  const serverUrl = useAutomatorStore(s => s.serverUrl);
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });

  const normalizedServerUrl = useMemo(() => normalizeServerUrl(serverUrl), [serverUrl]);

  useEffect(() => {
    if (!normalizedServerUrl) {
      setUpdate({ status: 'hidden' });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    if (!/^https?:\/\//.test(normalizedServerUrl)) {
      setUpdate({ status: 'hidden' });
      return;
    }

    async function checkForUpdate() {
      setUpdate({ status: 'checking' });

      try {
        const url = `${normalizedServerUrl}/api/automator/update-check?currentVersion=${encodeURIComponent(__APP_VERSION__)}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Update check failed (${res.status})`);

        const data = await res.json() as UpdateCheckResponse;
        if (cancelled) return;

        if (!data.updateAvailable || !data.version) {
          setUpdate({ status: 'hidden' });
          return;
        }

        if (!data.mandatory && getDismissedVersion() === data.version) {
          setUpdate({ status: 'hidden' });
          return;
        }

        setUpdate({
          status: 'available',
          version: data.version,
          downloadUrl: resolveDownloadUrl(normalizedServerUrl, data.downloadUrl),
          mandatory: data.mandatory,
        });
      } catch (e) {
        if (cancelled || controller.signal.aborted) return;
        console.warn('Failed to check for Automator update:', e);
        setUpdate({ status: 'hidden' });
      }
    }

    const timer = window.setTimeout(checkForUpdate, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedServerUrl]);

  if (update.status !== 'available') return null;

  const handleLater = () => {
    setDismissedVersion(update.version);
    setUpdate({ status: 'hidden' });
  };

  return (
    <div className="bg-od-warning text-black border-b border-yellow-300 px-4 py-2">
      <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px] text-sm font-medium">
          New Automator version available: v{update.version}
          <span className="font-normal opacity-80"> (current v{__APP_VERSION__})</span>
          {update.mandatory && <span className="ml-2 font-semibold">Required update</span>}
        </div>
        <a
          href={update.downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded bg-black text-white text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          Download
        </a>
        {!update.mandatory && (
          <button
            type="button"
            onClick={handleLater}
            className="px-3 py-1.5 rounded border border-black/30 text-sm font-medium hover:bg-black/10 transition-colors"
          >
            Later
          </button>
        )}
      </div>
    </div>
  );
}
