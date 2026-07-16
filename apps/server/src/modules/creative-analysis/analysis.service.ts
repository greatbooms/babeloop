import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  /** adText + 연결 미디어의 OCR·전사 텍스트를 합쳐 분석·임베딩 입력을 만든다 */
  async buildInputText(sourceAdId: string): Promise<string> {
    const ad = await this.prisma.sourceAd.findUniqueOrThrow({
      where: { id: sourceAdId },
      include: { mediaAsset: { include: { ocrResults: true, transcriptions: true } } },
    });
    const parts = [
      ad.title,
      ad.adText,
      ...(ad.mediaAsset?.ocrResults.map((o) => o.text) ?? []),
      ...(ad.mediaAsset?.transcriptions.map((tr) => tr.text) ?? []),
    ].filter((x): x is string => Boolean(x && x.trim()));
    if (parts.length === 0) throw new Error('분석할 텍스트가 없습니다 — adText 또는 OCR/전사 결과 필요');
    return parts.join('\n');
  }
}
