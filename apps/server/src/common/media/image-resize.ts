import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

function runFfmpeg(binary: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 30_000 }, (error) => (error ? reject(error) : resolve()));
  });
}

/** 이미지 버퍼를 중앙 크롭한 뒤 정확한 PNG 픽셀 규격으로 리사이즈한다. */
export async function resizeImageToSpec(buffer: Buffer, width: number, height: number): Promise<Buffer> {
  const ffmpegPath = require('ffmpeg-static') as string | null;
  if (!ffmpegPath) throw new Error('ffmpeg 바이너리를 찾을 수 없습니다');

  const dir = await mkdtemp(join(tmpdir(), 'babeloop-image-resize-'));
  try {
    const input = join(dir, 'input');
    const output = join(dir, 'output.png');
    const targetRatio = width / height;

    await writeFile(input, buffer);
    await runFfmpeg(ffmpegPath, [
      '-i',
      input,
      '-vf',
      `crop='min(iw,ih*${targetRatio})':'min(ih,iw/${targetRatio})',scale=${width}:${height}:flags=lanczos`,
      '-frames:v',
      '1',
      output,
      '-y',
    ]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
