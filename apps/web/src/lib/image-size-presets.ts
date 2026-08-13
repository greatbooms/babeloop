export const IMAGE_SIZE_PRESET_OPTIONS = [
  {
    id: 'square_1200x1200',
    caption: '1200×1200',
    labelKey: 'review.imageSizeSquare1200x1200',
  },
  {
    id: 'landscape_600x500',
    caption: '600×500',
    labelKey: 'review.imageSizeLandscape600x500',
  },
  {
    id: 'portrait_960x1200',
    caption: '960×1200',
    labelKey: 'review.imageSizePortrait960x1200',
  },
  {
    id: 'portrait_300x500',
    caption: '300×500',
    labelKey: 'review.imageSizePortrait300x500',
  },
  {
    id: 'landscape_1200x628',
    caption: '1200×628',
    labelKey: 'review.imageSizeLandscape1200x628',
  },
  {
    id: 'banner_600x200',
    caption: '600×200',
    labelKey: 'review.imageSizeBanner600x200',
  },
  {
    id: 'banner_908x226',
    caption: '908×226',
    labelKey: 'review.imageSizeBanner908x226',
  },
] as const;

export type ImageSizePresetId = (typeof IMAGE_SIZE_PRESET_OPTIONS)[number]['id'];

export const DEFAULT_IMAGE_SIZE_PRESET: ImageSizePresetId = 'square_1200x1200';

export function resolveImageSizePresetId(id?: string | null): ImageSizePresetId {
  return IMAGE_SIZE_PRESET_OPTIONS.some((preset) => preset.id === id)
    ? (id as ImageSizePresetId)
    : DEFAULT_IMAGE_SIZE_PRESET;
}

export function imageSizePresetCaption(id?: string | null): string | null {
  return IMAGE_SIZE_PRESET_OPTIONS.find((preset) => preset.id === id)?.caption ?? null;
}
