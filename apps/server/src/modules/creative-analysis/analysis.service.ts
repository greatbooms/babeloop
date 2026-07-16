import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  /** adText + 연결 미디어의 OCR·전사 텍스트를 합쳐 분석·임베딩 입력을 만든다.
   *  title은 내부 관리용 라벨이라 포함하지 않는다 — 광고 콘텐츠가 아닌 텍스트가 임베딩을 오염시켜
   *  동일 문구 광고의 유사도가 낮아지는 문제가 있었다. */
  async buildInputText(sourceAdId: string): Promise<string> {
    const ad = await this.prisma.sourceAd.findUniqueOrThrow({
      where: { id: sourceAdId },
      include: { mediaAsset: { include: { ocrResults: true, transcriptions: true } } },
    });
    const parts = [
      ad.adText,
      ...(ad.mediaAsset?.ocrResults.map((o) => o.text) ?? []),
      ...(ad.mediaAsset?.transcriptions.map((tr) => tr.text) ?? []),
    ].filter((x): x is string => Boolean(x && x.trim()));
    if (parts.length === 0) throw new Error('분석할 텍스트가 없습니다 — adText 또는 OCR/전사 결과 필요');
    return parts.join('\n');
  }
}
