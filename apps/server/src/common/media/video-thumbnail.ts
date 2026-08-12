import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

type ThumbnailRunner = (binary: string, args: string[]) => Promise<void>;

type ThumbnailDependencies = {
  ffmpegPath?: string | null;
  run?: ThumbnailRunner;
};

function runExecFile(binary: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 30_000 }, (error) => (error ? reject(error) : resolve()));
  });
}

/** 영상 버퍼에서 1초 지점 프레임을 JPEG로 추출한다. ffmpeg-static 바이너리 사용, AI 비용 0. */
export async function extractVideoThumbnail(
  buffer: Buffer,
  dependencies: ThumbnailDependencies = {},
): Promise<Buffer> {
  const ffmpegPath = dependencies.ffmpegPath ?? (require('ffmpeg-static') as string | null);
  if (!ffmpegPath) throw new Error('ffmpeg 바이너리를 찾을 수 없습니다');

  const dir = await mkdtemp(join(tmpdir(), 'babeloop-thumb-'));
  try {
    const input = join(dir, 'input');
    const output = join(dir, 'thumb.jpg');
    await writeFile(input, buffer);
    await (dependencies.run ?? runExecFile)(ffmpegPath, [
      '-ss',
      '1',
      '-i',
      input,
      '-frames:v',
      '1',
      '-vf',
      'scale=480:-2',
      '-q:v',
      '4',
      output,
      '-y',
    ]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 영상 버퍼에 오디오 트랙이 있는지 검사한다 — 무음 광고 영상을 Whisper에 보내면 400이 난다(실측). */
export async function hasAudioStream(
  buffer: Buffer,
  dependencies: ThumbnailDependencies = {},
): Promise<boolean> {
  const ffmpegPath = dependencies.ffmpegPath ?? (require('ffmpeg-static') as string | null);
  if (!ffmpegPath) throw new Error('ffmpeg 바이너리를 찾을 수 없습니다');

  const dir = await mkdtemp(join(tmpdir(), 'babeloop-probe-'));
  try {
    const input = join(dir, 'input');
    await writeFile(input, buffer);
    // `ffmpeg -i`는 출력이 없어 exit 1이지만 stderr에 스트림 목록을 찍는다
    const stderr = await new Promise<string>((resolve) => {
      execFile(ffmpegPath, ['-i', input], { timeout: 30_000 }, (_error, _stdout, err) => resolve(String(err ?? '')));
    });
    return /Stream #\d+:\d+.*Audio:/.test(stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
