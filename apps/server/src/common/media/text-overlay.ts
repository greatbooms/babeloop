import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { access } from 'fs/promises';
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

const FONT_FAMILY = 'Noto Sans TC Overlay';
let fontRegistered = false;

async function ensureFont(): Promise<void> {
  if (fontRegistered) return;
  const fontPath = join(process.cwd(), 'apps/server/assets/fonts/NotoSansTC-Bold.otf');
  try {
    await access(fontPath);
  } catch {
    throw new Error(`텍스트 오버레이 폰트를 찾을 수 없습니다: ${fontPath}`);
  }
  if (!GlobalFonts.registerFromPath(fontPath, FONT_FAMILY)) {
    throw new Error(`텍스트 오버레이 폰트 등록에 실패했습니다: ${fontPath}`);
  }
  fontRegistered = true;
}

// ffmpeg drawtext가 아닌 canvas 렌더링을 쓰는 이유: 운영(리눅스)의 ffmpeg-static
// 정적 빌드에 drawtext 필터가 없어(harfbuzz 미포함) 나스에서만 실패했다 (실측).
export async function renderTextOverlay(
  buffer: Buffer,
  layout: OverlayLayout,
): Promise<Buffer> {
  await ensureFont();
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  for (const line of layout.lines) {
    const shadow = Math.max(2, Math.round(line.fontSize / 22));
    ctx.font = `${line.fontSize}px "${FONT_FAMILY}"`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowOffsetX = shadow;
    ctx.shadowOffsetY = shadow;
    ctx.shadowBlur = 0;
    ctx.fillText(line.text, image.width / 2, line.y);
  }
  return canvas.toBuffer('image/png');
}
