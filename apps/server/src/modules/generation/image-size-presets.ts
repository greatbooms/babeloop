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
  square: '정사각형에 가까운 구도 — 핵심 인물을 중앙에 크게, 하단 1/3은 텍스트 오버레이 여백',
  portrait: '세로형 구도 — 인물 상반신을 상단~중앙에, 하단은 텍스트 공간으로 단순하게',
  landscape: '가로형 구도 — 인물을 한쪽에 배치, 반대쪽은 텍스트 공간 확보',
  banner:
    '초광폭 배너 구도 — 인물은 좌우 가장자리, 중앙은 텍스트용 단순 배경. 상하가 크게 잘리므로 얼굴을 세로 중앙 높이에 배치',
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
    `## 출력 규격: ${preset.width}x${preset.height} (${ratio}) — 네이티브 ${preset.nativeSize}로 생성 후 중앙 크롭되므로 중요한 요소(얼굴·핵심 오브젝트)를 가장자리에 두지 말 것`,
    GROUP_PROMPTS[preset.group],
  ].join('\n');
}
