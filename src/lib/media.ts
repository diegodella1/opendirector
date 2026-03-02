import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

const VMIX_CODECS = new Set(['h264', 'hevc', 'h265', 'mpeg2video', 'prores', 'dnxhd']);
const VMIX_CONTAINERS = new Set(['.mp4', '.mov', '.avi', '.mxf', '.mpg']);

export interface MediaMetadata {
  codec: string | null;
  container: string | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  fps: number | null;
}

export async function ensureMediaDir(showId: string): Promise<string> {
  const dir = path.join(process.cwd(), 'data', 'shows', showId, 'media');
  await mkdir(dir, { recursive: true });
  const thumbDir = path.join(dir, 'thumbs');
  await mkdir(thumbDir, { recursive: true });
  return dir;
}

export async function extractMetadata(filePath: string): Promise<MediaMetadata> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    const info = JSON.parse(stdout);
    const videoStream = info.streams?.find((s: Record<string, unknown>) => s.codec_type === 'video');
    const format = info.format || {};

    let fps: number | null = null;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      if (den > 0) fps = Math.round((num / den) * 100) / 100;
    }

    return {
      codec: videoStream?.codec_name || null,
      container: format.format_name?.split(',')[0] || null,
      width: videoStream?.width || null,
      height: videoStream?.height || null,
      duration_sec: format.duration ? parseFloat(format.duration) : null,
      fps,
    };
  } catch {
    return { codec: null, container: null, width: null, height: null, duration_sec: null, fps: null };
  }
}

export async function generateThumbnail(inputPath: string, outputPath: string, isImage = false): Promise<boolean> {
  try {
    const args = isImage
      ? ['-y', '-i', inputPath, '-vf', 'scale=320:-1', '-q:v', '5', outputPath]
      : ['-y', '-i', inputPath, '-ss', '00:00:01', '-vframes', '1', '-vf', 'scale=320:-1', '-q:v', '5', outputPath];
    await execFileAsync('ffmpeg', args);
    return true;
  } catch {
    return false;
  }
}

export async function calculateChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export function isVmixCompatible(codec: string | null, ext: string): boolean {
  const codecOk = codec ? VMIX_CODECS.has(codec.toLowerCase()) : false;
  const extOk = VMIX_CONTAINERS.has(ext.toLowerCase());
  return codecOk && extOk;
}
