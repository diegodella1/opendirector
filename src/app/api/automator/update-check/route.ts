import { NextRequest, NextResponse } from 'next/server';
import { getLatestRelease, compareVersions } from '@/lib/github-releases';
export const dynamic = 'force-dynamic';

// GET /api/automator/update-check?currentVersion=X.Y.Z
export async function GET(request: NextRequest) {
  const currentVersion = request.nextUrl.searchParams.get('currentVersion');

  if (!currentVersion || !/^\d+\.\d+\.\d+$/.test(currentVersion)) {
    return NextResponse.json(
      { error: 'currentVersion query param required (format: X.Y.Z)' },
      { status: 400 }
    );
  }

  const release = await getLatestRelease();

  if (!release) {
    return NextResponse.json({
      updateAvailable: false,
      version: null,
      downloadUrl: null,
      releaseNotes: null,
      mandatory: false,
    });
  }

  const cmp = compareVersions(release.version, currentVersion);
  const currentMajor = parseInt(currentVersion.split('.')[0]);
  const latestMajor = parseInt(release.version.split('.')[0]);

  return NextResponse.json({
    updateAvailable: cmp > 0,
    version: release.version,
    downloadUrl: release.msiUrl,
    releaseNotes: release.releaseNotes,
    mandatory: latestMajor > currentMajor,
  });
}
