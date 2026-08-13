import { execFile } from 'child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export type OverlayGroup = 'square' | 'portrait' | 'landscape' | 'banner';

export interface OverlayLayout {
  lines: Array<{ text: string; fontSize: number; y: number }>;
}

const ANCHORS: Record<OverlayGroup, number> = {
  square: 0.74,
  portrait: 0.78,
  landscape: 0.6,
  banner: 0.5,
};

function maxCharacters(width: number, fontSize: number): number {
  return Math.max(1, Math.floor((width * 0.92) / fontSize));
}

function shrinkFontToFit(
  characterCount: number,
  width: number,
  initialSize: number,
  maximumLines: number,
  minimumSize: number,
): number {
  let fontSize = initialSize;
  while (
    characterCount > maxCharacters(width, fontSize) * maximumLines &&
    fontSize > minimumSize
  ) {
    fontSize = Math.max(minimumSize, Math.floor(fontSize * 0.9));
  }
  return fontSize;
}

export function computeOverlayLayout(input: {
  width: number;
  height: number;
  group: OverlayGroup;
  headline: string;
  subline?: string;
}): OverlayLayout {
  const headlineCharacters = Array.from(input.headline);
  const initialHeadlineSize = Math.max(16, Math.round(input.width / 20));
  const headlineFontSize = shrinkFontToFit(
    headlineCharacters.length,
    input.width,
    initialHeadlineSize,
    2,
    16,
  );
  const headlineLineLength = maxCharacters(input.width, headlineFontSize);
  const headlineTexts =
    headlineCharacters.length <= headlineLineLength
      ? [input.headline]
      : [
          headlineCharacters.slice(0, headlineLineLength).join(''),
          headlineCharacters.slice(headlineLineLength).join(''),
        ];

  const sublineCharacters = input.subline ? Array.from(input.subline) : [];
  const initialSublineSize = Math.round(headlineFontSize * 0.6);
  const sublineFontSize = sublineCharacters.length
    ? shrinkFontToFit(
        sublineCharacters.length,
        input.width,
        initialSublineSize,
        1,
        1,
      )
    : 0;

  const headlineGap = headlineTexts.length > 1 ? headlineFontSize * 0.35 : 0;
  const headlineHeight = headlineTexts.length * headlineFontSize + headlineGap;
  const sublineGap = sublineCharacters.length ? headlineFontSize * 0.5 : 0;
  const blockHeight = headlineHeight + sublineGap + sublineFontSize;
  let top = input.height * ANCHORS[input.group] - blockHeight / 2;

  const lines: OverlayLayout['lines'] = headlineTexts.map((text, index) => {
    const line = { text, fontSize: headlineFontSize, y: Math.round(top) };
    top += headlineFontSize;
    if (index < headlineTexts.length - 1) top += headlineFontSize * 0.35;
    return line;
  });

  if (sublineCharacters.length) {
    top += sublineGap;
    lines.push({
      text: input.subline!,
      fontSize: sublineFontSize,
      y: Math.round(top),
    });
  }

  return { lines };
}

function runFfmpeg(binary: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 30_000 }, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}

export async function renderTextOverlay(
  buffer: Buffer,
  layout: OverlayLayout,
): Promise<Buffer> {
  const ffmpegPath = require('ffmpeg-static') as string | null;
  if (!ffmpegPath) throw new Error('ffmpeg 바이너리를 찾을 수 없습니다');

  const fontPath = join(
    process.cwd(),
    'apps/server/assets/fonts/NotoSansTC-Bold.otf',
  );
  try {
    await access(fontPath);
  } catch {
    throw new Error(`텍스트 오버레이 폰트를 찾을 수 없습니다: ${fontPath}`);
  }

  const dir = await mkdtemp(join(tmpdir(), 'babeloop-text-overlay-'));
  try {
    const inputPath = join(dir, 'input');
    const outputPath = join(dir, 'output.png');
    await writeFile(inputPath, buffer);

    const filters: string[] = [];
    for (const [index, line] of layout.lines.entries()) {
      const textPath = join(dir, `line-${index}.txt`);
      await writeFile(textPath, line.text, 'utf8');
      const shadow = Math.max(2, Math.round(line.fontSize / 22));
      filters.push(
        `drawtext=fontfile='${fontPath}':textfile='${textPath}':fontsize=${line.fontSize}:fontcolor=white:x=(w-text_w)/2:y=${line.y}:shadowcolor=black@0.55:shadowx=${shadow}:shadowy=${shadow}`,
      );
    }

    await runFfmpeg(ffmpegPath, [
      '-i',
      inputPath,
      '-vf',
      filters.join(','),
      '-frames:v',
      '1',
      outputPath,
      '-y',
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
