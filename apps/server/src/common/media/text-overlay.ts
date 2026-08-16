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

export type OverlayColorKey = keyof typeof OVERLAY_COLORS;
export type OverlayColor = OverlayColorKey | 'auto' | `#${string}`;
export type ResolvedOverlayColor = { fill: string; shadow: string };

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function shadowForFill(fill: string, lightThreshold = 0.6): string {
  const red = Number.parseInt(fill.slice(1, 3), 16);
  const green = Number.parseInt(fill.slice(3, 5), 16);
  const blue = Number.parseInt(fill.slice(5, 7), 16);
  const relativeLuminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return relativeLuminance > lightThreshold
    ? 'rgba(0,0,0,0.6)'
    : 'rgba(255,255,255,0.35)';
}

export function resolveOverlayColor(
  color: string,
  options: { lightThreshold?: number } = {},
): ResolvedOverlayColor | null {
  if (color === 'auto') return null;
  if (Object.prototype.hasOwnProperty.call(OVERLAY_COLORS, color)) {
    return OVERLAY_COLORS[color as OverlayColorKey];
  }
  if (HEX_COLOR_PATTERN.test(color)) {
    return {
      fill: color,
      shadow: shadowForFill(color, options.lightThreshold),
    };
  }
  throw new Error(`지원하지 않는 오버레이 색상: ${String(color)}`);
}

function rgbToHsv(red: number, green: number, blue: number) {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === normalizedRed) {
      hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
    } else if (maximum === normalizedGreen) {
      hue = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
    } else {
      hue = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
    }
  }
  if (hue < 0) hue += 360;
  return {
    hue,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum,
  };
}

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

export async function extractAccentColor(buffer: Buffer): Promise<ResolvedOverlayColor> {
  const image = await loadImage(buffer);
  const canvas = createCanvas(64, 64);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, 64, 64);
  const pixels = context.getImageData(0, 0, 64, 64).data;
  const buckets = Array.from({ length: 12 }, () => ({
    count: 0,
    red: 0,
    green: 0,
    blue: 0,
  }));
  let eligiblePixels = 0;

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const { hue, saturation, value } = rgbToHsv(red, green, blue);
    if (saturation < 0.35 || value < 0.35 || value > 0.95) continue;
    const bucket = buckets[Math.floor(hue / 30) % buckets.length];
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    eligiblePixels += 1;
  }

  if (eligiblePixels / (pixels.length / 4) < 0.02) {
    return { ...OVERLAY_COLORS.white };
  }

  const accent = buckets.reduce((mostFrequent, bucket) =>
    bucket.count > mostFrequent.count ? bucket : mostFrequent,
  );
  const fill = toHex(
    accent.red / accent.count,
    accent.green / accent.count,
    accent.blue / accent.count,
  );
  return { fill, shadow: shadowForFill(fill) };
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
  options: {
    font: OverlayFont;
    color: OverlayColor;
    resolvedColor?: ResolvedOverlayColor;
  } = {
    font: 'gothic',
    color: 'white',
  },
): Promise<Buffer> {
  const fontDefinition = OVERLAY_FONTS[options.font];
  if (!fontDefinition) {
    throw new Error(`지원하지 않는 오버레이 폰트: ${String(options.font)}`);
  }
  const colorDefinition = options.resolvedColor ?? resolveOverlayColor(options.color);
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
