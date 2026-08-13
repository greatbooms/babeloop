import { GraphQLError } from 'graphql';
import {
  IMAGE_SIZE_PRESETS,
  buildSizePromptSection,
  resolveSizePreset,
} from './image-size-presets';

describe('image size presets', () => {
  it('광고 규격 7종을 네이티브 생성 크기와 구도군에 매핑한다', () => {
    expect(IMAGE_SIZE_PRESETS).toEqual([
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
    ]);
  });

  it('규격을 지정하지 않으면 1200×1200 기본값을 반환한다', () => {
    expect(resolveSizePreset()).toEqual(IMAGE_SIZE_PRESETS[0]);
  });

  it('모르는 규격은 허용 목록을 포함한 BAD_USER_INPUT으로 거부한다', () => {
    expect(() => resolveSizePreset('')).toThrow(GraphQLError);

    let thrown: unknown;

    try {
      resolveSizePreset('unknown_size');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GraphQLError);
    expect((thrown as GraphQLError).extensions.code).toBe('BAD_USER_INPUT');
    for (const preset of IMAGE_SIZE_PRESETS) {
      expect((thrown as Error).message).toContain(preset.id);
    }
  });

  it('공통 크롭 주의와 구도군 지시를 출력 규격 섹션으로 만든다', () => {
    const preset = resolveSizePreset('banner_600x200');

    expect(buildSizePromptSection(preset)).toBe(
      '## 출력 규격: 600x200 (3:1) — 네이티브 1536x1024로 생성 후 중앙 크롭되므로 중요한 요소(얼굴·핵심 오브젝트)를 가장자리에 두지 말 것\n' +
        '초광폭 배너 구도 — 인물은 좌우 가장자리, 중앙은 문구가 나중에 얹힐 단순한 배경. 상하가 크게 잘리므로 얼굴을 세로 중앙 높이에 배치',
    );
  });
});
