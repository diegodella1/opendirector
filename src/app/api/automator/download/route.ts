import { NextResponse } from 'next/server';
import { getLatestRelease } from '@/lib/github-releases';

// GET /api/automator/download → 302 redirect to MSI on GitHub Releases
export async function GET() {
  const release = await getLatestRelease();

  if (!release?.msiUrl) {
    return NextResponse.json(
      { error: 'No Automator release available' },
      { status: 404 }
    );
  }

  return NextResponse.redirect(release.msiUrl, 302);
}
