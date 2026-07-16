import { Inject, Injectable } from '@nestjs/common';
import { PolicyCheckStatus, PolicyCheckType, Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../../providers/embedding/embedding.provider';
import { VectorSearchRepository } from '../creative-analysis/vector-search.repository';
import { BANNED_TERMS, MINOR_SIGNAL_TERMS } from './banned-terms';

const SIMILARITY_THRESHOLD = 0.9;

@Injectable()
export class PolicyCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vectors: VectorSearchRepository,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
  ) {}

  /** 검사 3종을 기록하고, 미성년자 신호가 있으면 설정 불가능한 하드게이트를 켠다. */
  async runAll(creativeId: string): Promise<{ minorFlagged: boolean }> {
    const creative = await this.prisma.generatedCreative.findUniqueOrThrow({
      where: { id: creativeId },
      include: { localizations: { orderBy: { createdAt: 'desc' } } },
    });
    const texts = [creative.koreanText, ...creative.localizations.map((item) => item.text)].join(
      '\n',
    );

    const bannedHits = BANNED_TERMS.filter((term) => texts.includes(term));
    await this.record(
      creativeId,
      'BANNED_TERM',
      bannedHits.length > 0 ? 'WARN' : 'PASS',
      { hits: bannedHits },
    );

    const vector = await this.embedder.embed(creative.koreanText);
    const similar = await this.vectors.searchSimilar({
      vector,
      model: this.embedder.model,
      limit: 1,
    });
    const topSimilarity = similar[0]?.similarity ?? 0;
    await this.record(
      creativeId,
      'SIMILARITY',
      topSimilarity > SIMILARITY_THRESHOLD ? 'WARN' : 'PASS',
      {
        topSimilarity,
        threshold: SIMILARITY_THRESHOLD,
        nearestSourceAdId: similar[0]?.sourceAdId ?? null,
      },
    );

    const minorHits = MINOR_SIGNAL_TERMS.filter((term) => texts.includes(term));
    const minorFlagged = minorHits.length > 0;
    await this.record(
      creativeId,
      'MINOR_SIGNAL',
      minorFlagged ? 'FLAGGED' : 'PASS',
      { hits: minorHits },
    );
    if (minorFlagged) {
      await this.prisma.generatedCreative.update({
        where: { id: creativeId },
        data: {
          minorFlagged: true,
          minorFlagNote: `자동 플래그: ${minorHits.join(', ')}`,
        },
      });
    }
    return { minorFlagged };
  }

  private record(
    creativeId: string,
    checkType: PolicyCheckType,
    status: PolicyCheckStatus,
    detail: Prisma.InputJsonObject,
  ) {
    return this.prisma.policyCheck.create({
      data: { creativeId, checkType, status, detail },
    });
  }
}
