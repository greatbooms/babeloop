export type OverlayMode = 'SERVER' | 'AI';
export type OverlayFont = 'gothic' | 'serif' | 'rounded' | 'kai' | 'yozai' | 'iansui' | 'genryu';
export type OverlayColor = 'white' | 'black' | 'gold';
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

export function overlayPreviewText(headline: string, approvedZhTw?: string | null): string {
  return headline.trim() || approvedZhTw?.trim().split(/\r?\n/)[0] || '戰場上的智慧女神';
}
