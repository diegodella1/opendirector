const REPO = 'diegodella1/opendirector';
const TAG_PREFIX = 'automator-v';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: GitHubAsset[];
  html_url: string;
}

export interface AutomatorRelease {
  version: string;
  tagName: string;
  name: string;
  releaseNotes: string;
  publishedAt: string;
  msiUrl: string | null;
  msiSize: number | null;
  htmlUrl: string;
}

let cachedRelease: AutomatorRelease | null = null;
let cacheTimestamp = 0;

export function parseVersion(tag: string): string {
  return tag.startsWith(TAG_PREFIX) ? tag.slice(TAG_PREFIX.length) : tag;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export async function getLatestRelease(): Promise<AutomatorRelease | null> {
  const now = Date.now();
  if (cachedRelease && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRelease;
  }

  try {
    // Fetch releases with automator tag prefix
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=20`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
      }
    );

    if (!res.ok) return cachedRelease ?? null;

    const releases: GitHubRelease[] = await res.json();

    // Find the latest automator release
    const automatorRelease = releases.find((r) =>
      r.tag_name.startsWith(TAG_PREFIX)
    );

    if (!automatorRelease) {
      cachedRelease = null;
      cacheTimestamp = now;
      return null;
    }

    const msiAsset = automatorRelease.assets.find((a) =>
      a.name.endsWith('.msi')
    );

    cachedRelease = {
      version: parseVersion(automatorRelease.tag_name),
      tagName: automatorRelease.tag_name,
      name: automatorRelease.name,
      releaseNotes: automatorRelease.body || '',
      publishedAt: automatorRelease.published_at,
      msiUrl: msiAsset?.browser_download_url ?? null,
      msiSize: msiAsset?.size ?? null,
      htmlUrl: automatorRelease.html_url,
    };
    cacheTimestamp = now;
    return cachedRelease;
  } catch {
    return cachedRelease ?? null;
  }
}
