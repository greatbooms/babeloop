export type OverlayMode = 'SERVER' | 'AI';
export type OverlayFont = 'gothic' | 'serif' | 'rounded' | 'kai' | 'yozai' | 'iansui' | 'genryu';
export type OverlayPresetColor = 'white' | 'black' | 'gold';
export type OverlayColor = OverlayPresetColor | 'auto' | `#${string}`;
export type AiTypoStyle = 'selected' | 'match_reference' | 'auto';

export const OVERLAY_FONT_OPTIONS = [
  { id: 'gothic', family: 'Noto Sans TC Overlay', labelKey: 'review.overlayFontGothic' },
  { id: 'serif', family: 'Noto Serif TC Overlay', labelKey: 'review.overlayFontSerif' },
  { id: 'rounded', family: 'JF Open Huninn Overlay', labelKey: 'review.overlayFontRounded' },
  { id: 'kai', family: 'LXGW WenKai TC Overlay', labelKey: 'review.overlayFontKai' },
  { id: 'yozai', family: 'Yozai Overlay', labelKey: 'review.overlayFontYozai' },
  { id: 'iansui', family: 'Iansui Overlay', labelKey: 'review.overlayFontIansui' },
  { id: 'genryu', family: 'GenRyuMin Overlay', labelKey: 'review.overlayFontGenryu' },
] as const;

export const OVERLAY_COLOR_OPTIONS = [
  { id: 'white', value: '#FFFFFF', shadow: 'rgba(0,0,0,0.55)', labelKey: 'review.overlayColorWhite' },
  { id: 'black', value: '#1A1A1A', shadow: 'rgba(255,255,255,0.35)', labelKey: 'review.overlayColorBlack' },
  { id: 'gold', value: '#E8C87A', shadow: 'rgba(0,0,0,0.6)', labelKey: 'review.overlayColorGold' },
] as const;

export function isCustomOverlayColor(value: string | null | undefined): value is `#${string}` {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isOverlayColor(value: string | null | undefined): value is OverlayColor {
  return value === 'auto' || OVERLAY_COLOR_OPTIONS.some((color) => color.id === value) || isCustomOverlayColor(value);
}

export function resolveOverlayPreviewColor(color: OverlayColor) {
  if (color === 'auto') return null;
  const preset = OVERLAY_COLOR_OPTIONS.find((option) => option.id === color);
  if (preset) return preset;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const relativeLuminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return {
    value: color,
    shadow: relativeLuminance > 0.6
      ? 'rgba(0,0,0,0.6)'
      : 'rgba(255,255,255,0.35)',
  };
}

export function overlayPreviewText(headline: string, approvedZhTw?: string | null): string {
  return headline.trim() || approvedZhTw?.trim().split(/\r?\n/)[0] || '戰場上的智慧女神';
}
