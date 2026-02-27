import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { stat, createReadStream } from 'fs';
import { promisify } from 'util';
import path from 'path';

const statAsync = promisify(stat);

// GET /api/media/:id — download media file (with Range support)
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { data: media, error } = await supabase
    .from('od_media')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 });
  }

  const filePath = path.join(
    process.cwd(),
    'data',
    'shows',
    media.show_id,
    'media',
    media.filename
  );

  let fileStat;
  try {
    fileStat = await statAsync(filePath);
  } catch {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }

  const range = request.headers.get('range');

  if (range) {
    // Parse Range header
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      return new NextResponse('Invalid range', { status: 416 });
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : fileStat.size - 1;

    if (start >= fileStat.size) {
      return new NextResponse('Range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileStat.size}` },
      });
    }

    const chunkSize = end - start + 1;
    const stream = createReadStream(filePath, { start, end });

    // Convert Node stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
    });

    return new NextResponse(webStream as unknown as BodyInit, {
      status: 206,
      headers: {
        'Content-Type': media.mime_type,
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  // Full file download
  const stream = createReadStream(filePath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });

  return new NextResponse(webStream as unknown as BodyInit, {
    headers: {
      'Content-Type': media.mime_type,
      'Content-Length': String(fileStat.size),
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename="${media.original_name}"`,
    },
  });
}

// DELETE /api/media/:id — delete media file
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { data: media, error: fetchError } = await supabase
    .from('od_media')
    .select('*')
    .eq('id', params.id)
    .single();

  if (fetchError || !media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 });
  }

  // Delete from DB
  const { error } = await supabase
    .from('od_media')
    .delete()
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Try to delete files (best effort)
  const fs = await import('fs/promises');
  const filePath = path.join(process.cwd(), 'data', 'shows', media.show_id, 'media', media.filename);
  try { await fs.unlink(filePath); } catch { /* ignore */ }

  if (media.thumbnail_path) {
    const thumbPath = path.join(process.cwd(), 'data', 'shows', media.show_id, 'media', media.thumbnail_path);
    try { await fs.unlink(thumbPath); } catch { /* ignore */ }
  }

  // Update show media_size_bytes
  const { data: sizeResult } = await supabase
    .from('od_media')
    .select('size_bytes')
    .eq('show_id', media.show_id);

  if (sizeResult) {
    const totalSize = sizeResult.reduce((acc: number, m: { size_bytes: number }) => acc + m.size_bytes, 0);
    await supabase
      .from('od_shows')
      .update({ media_size_bytes: totalSize })
      .eq('id', media.show_id);
  }

  return NextResponse.json({ deleted: true });
}
