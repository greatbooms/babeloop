import { GraphQLError } from 'graphql';

export const IMAGE_SIZE_PRESETS = [
  {
    id: 'square_1200x1200',
    width: 1200,
    height: 1200,
    nativeSize: '1024x1024',
    group: 'square',
    label: '1200×1200 (1:1)',
  },
  {
    id: 'landscape_600x500',
    width: 600,
    height: 500,
    nativeSize: '1024x1024',
    group: 'square',
    label: '600×500 (6:5)',
  },
  {
    id: 'portrait_960x1200',
    width: 960,
    height: 1200,
    nativeSize: '1024x1536',
    group: 'portrait',
    label: '960×1200 (4:5)',
  },
  {
    id: 'portrait_300x500',
    width: 300,
    height: 500,
    nativeSize: '1024x1536',
    group: 'portrait',
    label: '300×500 (3:5)',
  },
  {
    id: 'landscape_1200x628',
    width: 1200,
    height: 628,
    nativeSize: '1536x1024',
    group: 'landscape',
    label: '1200×628 (1.91:1)',
  },
  {
    id: 'banner_600x200',
    width: 600,
    height: 200,
    nativeSize: '1536x1024',
    group: 'banner',
    label: '600×200 (3:1)',
  },
  {
    id: 'banner_908x226',
    width: 908,
    height: 226,
    nativeSize: '1536x1024',
    group: 'banner',
    label: '908×226 (4:1)',
  },
] as const;

export type ImageSizePreset = (typeof IMAGE_SIZE_PRESETS)[number];

const DEFAULT_SIZE_PRESET = IMAGE_SIZE_PRESETS[0];

const GROUP_PROMPTS: Record<ImageSizePreset['group'], string> = {
  square:
    'Near-square composition — make the key subject large and central, leaving the lower third as simple empty space for copy to be composited later; do not draw text.',
  portrait:
    "Portrait composition — place the subject's upper body from the upper area through the center, keeping the lower area simple and empty for copy to be composited later.",
  landscape:
    'Landscape composition — place the subject on one side and keep the opposite side as simple empty space for copy to be composited later.',
  banner:
    'Ultra-wide banner composition — place the subject toward a side edge and keep the center as a simple empty background for copy to be composited later. Heavy top-and-bottom cropping is expected, so keep faces vertically centered.',
};

export function resolveSizePreset(id?: string): ImageSizePreset {
  if (id === undefined) return DEFAULT_SIZE_PRESET;

  const preset = IMAGE_SIZE_PRESETS.find((candidate) => candidate.id === id);
  if (preset) return preset;

  throw new GraphQLError(
    `지원하지 않는 이미지 규격입니다: ${id}. 허용 목록: ${IMAGE_SIZE_PRESETS.map((candidate) => candidate.id).join(', ')}`,
    { extensions: { code: 'BAD_USER_INPUT' } },
  );
}

export function buildSizePromptSection(preset: ImageSizePreset): string {
  const ratio = preset.label.slice(preset.label.lastIndexOf('(') + 1, -1);
  return [
    `## Output format: ${preset.width}x${preset.height} (${ratio}) — generated at native ${preset.nativeSize} then center-cropped; keep faces and key objects away from the edges.`,
    GROUP_PROMPTS[preset.group],
  ].join('\n');
}
