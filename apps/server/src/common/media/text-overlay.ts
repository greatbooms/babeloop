import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { access } from 'fs/promises';
import { join } from 'path';

export type OverlayGroup = 'square' | 'portrait' | 'landscape' | 'banner';

export interface OverlayLayout {
  lines: Array<{ text: string; fontSize: number; y: number }>;
}

export const OVERLAY_FONTS = {
  gothic: { file: 'NotoSansTC-Bold.otf', family: 'Noto Sans TC Overlay' },
  serif: { file: 'NotoSerifTC-Bold.otf', family: 'Noto Serif TC Overlay' },
  rounded: { file: 'jf-openhuninn-2.1.ttf', family: 'JF Open Huninn Overlay' },
  kai: { file: 'LXGWWenKaiTC-Medium.ttf', family: 'LXGW WenKai TC Overlay' },
  yozai: { file: 'Yozai-Medium.ttf', family: 'Yozai Overlay' },
  iansui: { file: 'Iansui-Regular.ttf', family: 'Iansui Overlay' },
  genryu: { file: 'GenRyuMin2TC-B.otf', family: 'GenRyuMin Overlay' },
} as const;

export type OverlayFont = keyof typeof OVERLAY_FONTS;

export const OVERLAY_COLORS = {
  white: { fill: '#FFFFFF', shadow: 'rgba(0,0,0,0.55)' },
  black: { fill: '#1A1A1A', shadow: 'rgba(255,255,255,0.35)' },
  gold: { fill: '#E8C87A', shadow: 'rgba(0,0,0,0.6)' },
} as const;

export type OverlayColor = keyof typeof OVERLAY_COLORS;

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

const registeredFonts = new Set<OverlayFont>();

async function ensureFont(font: OverlayFont): Promise<void> {
  const fontDefinition = OVERLAY_FONTS[font];
  if (!fontDefinition) {
    throw new Error(`지원하지 않는 오버레이 폰트: ${String(font)}`);
  }
  if (registeredFonts.has(font)) return;
  const fontPath = join(process.cwd(), 'apps/server/assets/fonts', fontDefinition.file);
  try {
    await access(fontPath);
  } catch {
    throw new Error(`텍스트 오버레이 폰트를 찾을 수 없습니다: ${fontPath}`);
  }
  if (!GlobalFonts.registerFromPath(fontPath, fontDefinition.family)) {
    throw new Error(`텍스트 오버레이 폰트 등록에 실패했습니다: ${fontPath}`);
  }
  registeredFonts.add(font);
}

// ffmpeg drawtext가 아닌 canvas 렌더링을 쓰는 이유: 운영(리눅스)의 ffmpeg-static
// 정적 빌드에 drawtext 필터가 없어(harfbuzz 미포함) 나스에서만 실패했다 (실측).
export async function renderTextOverlay(
  buffer: Buffer,
  layout: OverlayLayout,
  options: { font: OverlayFont; color: OverlayColor } = {
    font: 'gothic',
    color: 'white',
  },
): Promise<Buffer> {
  const fontDefinition = OVERLAY_FONTS[options.font];
  if (!fontDefinition) {
    throw new Error(`지원하지 않는 오버레이 폰트: ${String(options.font)}`);
  }
  const colorDefinition = OVERLAY_COLORS[options.color];
  if (!colorDefinition) {
    throw new Error(`지원하지 않는 오버레이 색상: ${String(options.color)}`);
  }
  await ensureFont(options.font);
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = colorDefinition.fill;
  for (const line of layout.lines) {
    const shadow = Math.max(2, Math.round(line.fontSize / 22));
    ctx.font = `${line.fontSize}px "${fontDefinition.family}"`;
    ctx.shadowColor = colorDefinition.shadow;
    ctx.shadowOffsetX = shadow;
    ctx.shadowOffsetY = shadow;
    ctx.shadowBlur = 0;
    ctx.fillText(line.text, image.width / 2, line.y);
  }
  return canvas.toBuffer('image/png');
}
