import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { stat, createReadStream } from 'fs';
import { promisify } from 'util';
import path from 'path';

const statAsync = promisify(stat);

// GET /api/shows/:id/media/thumb/:mediaId — serve thumbnail
export async function GET(
  _request: Request,
  { params }: { params: { id: string; mediaId: string } }
) {
  const { data: media, error } = await supabase
    .from('od_media')
    .select('thumbnail_path')
    .eq('id', params.mediaId)
    .eq('show_id', params.id)
    .single();

  if (error || !media || !media.thumbnail_path) {
    return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });
  }

  const thumbPath = path.join(
    process.cwd(),
    'data',
    'shows',
    params.id,
    'media',
    media.thumbnail_path
  );

  let fileStat;
  try {
    fileStat = await statAsync(thumbPath);
  } catch {
    return NextResponse.json({ error: 'Thumbnail file not found on disk' }, { status: 404 });
  }

  const stream = createReadStream(thumbPath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });

  return new NextResponse(webStream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(fileStat.size),
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
