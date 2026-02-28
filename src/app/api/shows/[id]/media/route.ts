import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { ensureMediaDir, extractMetadata, generateThumbnail, calculateChecksum, isVmixCompatible } from '@/lib/media';
import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import path from 'path';

// GET /api/shows/:id/media — list media files
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from('od_media')
    .select('*')
    .eq('show_id', params.id)
    .order('uploaded_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/shows/:id/media — upload media file
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  // Category: use explicit override or infer from mime type
  const categoryOverride = formData.get('category') as string | null;
  const validCategories = ['clip', 'stinger', 'graphic', 'lower_third', 'audio'];
  let category: string | null = null;
  if (categoryOverride && validCategories.includes(categoryOverride)) {
    category = categoryOverride;
  } else {
    const mime = file.type || '';
    if (mime.startsWith('video/')) category = 'clip';
    else if (mime.startsWith('image/')) category = 'graphic';
    else if (mime.startsWith('audio/')) category = 'audio';
  }

  const mediaDir = await ensureMediaDir(params.id);
  const ext = path.extname(file.name) || '.bin';
  const uuid = randomUUID();
  const filename = `${uuid}${ext}`;
  const filePath = path.join(mediaDir, filename);

  // Write file to disk
  const arrayBuffer = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));

  // Extract metadata with ffprobe
  const metadata = await extractMetadata(filePath);

  // Generate thumbnail
  const thumbPath = path.join(mediaDir, 'thumbs', `${uuid}.jpg`);
  const hasThumb = await generateThumbnail(filePath, thumbPath);

  // Calculate checksum
  const checksum = await calculateChecksum(filePath);

  // Check vMix compatibility
  const vmixCompatible = isVmixCompatible(metadata.codec, ext);

  // Insert into DB
  const { data, error } = await supabase
    .from('od_media')
    .insert({
      show_id: params.id,
      filename,
      original_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      codec: metadata.codec,
      container: metadata.container,
      width: metadata.width,
      height: metadata.height,
      duration_sec: metadata.duration_sec,
      thumbnail_path: hasThumb ? `thumbs/${uuid}.jpg` : null,
      checksum,
      vmix_compatible: vmixCompatible,
      category,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update show media_size_bytes
  const { data: sizeResult } = await supabase
    .from('od_media')
    .select('size_bytes')
    .eq('show_id', params.id);

  if (sizeResult) {
    const totalSize = sizeResult.reduce((acc: number, m: { size_bytes: number }) => acc + m.size_bytes, 0);
    await supabase
      .from('od_shows')
      .update({ media_size_bytes: totalSize })
      .eq('id', params.id);
  }

  // Broadcast via WS
  if (global.__wsBroadcast) {
    global.__wsBroadcast(params.id, {
      channel: 'media',
      type: 'media_uploaded',
      payload: { media: data },
    });
  }

  return NextResponse.json(data, { status: 201 });
}
