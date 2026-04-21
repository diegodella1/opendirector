const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

function normalizeBasePath(path: string): string {
  if (!path || path === '/') return '';
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

const basePath = normalizeBasePath(rawBasePath);

export function getBasePath(): string {
  return basePath;
}

export function appPath(path = ''): string {
  if (!path || path === '/') {
    return basePath || '/';
  }

  if (/^[a-z]+:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return basePath ? `${basePath}${normalizedPath}` : normalizedPath;
}

export function appWsUrl(path = '/ws'): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${appPath(path)}`;
}
