import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

interface ExtractedMediaText {
  ocrResults: Array<{ text: string }>;
  transcriptions: Array<{ text: string }>;
  visualDescriptions: Array<{ text: string }>;
}

export function buildExtractedMediaText(media: ExtractedMediaText): string {
  const extractedText = [...media.ocrResults, ...media.transcriptions]
    .map((item) => item.text.trim())
    .filter(Boolean);
  const visualText = media.visualDescriptions
    .map((item) => item.text.trim())
    .filter(Boolean);
  if (visualText.length > 0) {
    extractedText.push(`## 비주얼 묘사\n${visualText.join('\n')}`);
  }
  return extractedText.join('\n');
}

@Injectable()
export class AnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  /** adText + 연결 미디어의 OCR·전사·비주얼 묘사를 합쳐 분석·임베딩 입력을 만든다.
   *  title은 내부 관리용 라벨이라 포함하지 않는다 — 광고 콘텐츠가 아닌 텍스트가 임베딩을 오염시켜
   *  동일 문구 광고의 유사도가 낮아지는 문제가 있었다. */
  async buildInputText(sourceAdId: string): Promise<string> {
    const ad = await this.prisma.sourceAd.findUniqueOrThrow({
      where: { id: sourceAdId },
      include: { mediaAsset: { include: { ocrResults: true, transcriptions: true, visualDescriptions: true } } },
    });
    const parts = [
      ad.adText,
      ad.mediaAsset ? buildExtractedMediaText(ad.mediaAsset) : null,
    ].filter((x): x is string => Boolean(x && x.trim()));
    if (parts.length === 0) {
      throw new Error('분석할 재료가 없습니다 — 문구 입력 또는 텍스트 추출(비주얼 묘사 포함)이 필요합니다');
    }
    return parts.join('\n');
  }
}
