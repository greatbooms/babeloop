import { AnalysisService, buildExtractedMediaText } from './analysis.service';

describe('buildExtractedMediaText', () => {
  it('OCR·전사 뒤에 비주얼 묘사를 명시적인 섹션으로 조립한다', () => {
    expect(buildExtractedMediaText({
      ocrResults: [{ text: '이미지 글자' }],
      transcriptions: [{ text: '영상 음성' }],
      visualDescriptions: [{ text: '캐릭터와 구도 묘사' }],
    })).toBe('이미지 글자\n영상 음성\n## 비주얼 묘사\n캐릭터와 구도 묘사');
  });
});

describe('AnalysisService.buildInputText', () => {
  it('제목을 제외하고 광고 문구와 비주얼 묘사를 분석·임베딩 입력으로 만든다', async () => {
    const prisma = {
      sourceAd: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          title: '내부 관리 제목',
          adText: '광고 문구',
          mediaAsset: {
            ocrResults: [],
            transcriptions: [],
            visualDescriptions: [{ text: '시선을 끄는 일러스트' }],
          },
        }),
      },
    };

    await expect(new AnalysisService(prisma as never).buildInputText('ad-1'))
      .resolves.toBe('광고 문구\n## 비주얼 묘사\n시선을 끄는 일러스트');
  });
});
