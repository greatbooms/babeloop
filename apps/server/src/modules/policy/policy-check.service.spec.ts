import { PrismaService } from '../../common/prisma/prisma.service';
import { VectorSearchRepository } from '../creative-analysis/vector-search.repository';
import { EmbeddingProvider } from '../../providers/embedding/embedding.provider';
import { PolicyCheckService } from './policy-check.service';

describe('PolicyCheckService BabeGuard', () => {
  function harness(input: {
    koreanText: string;
    localizations?: string[];
    similarity?: number;
  }) {
    const checks: Array<{
      creativeId: string;
      checkType: string;
      status: string;
      detail: Record<string, unknown>;
    }> = [];
    const creativeUpdates: Array<Record<string, unknown>> = [];
    const prisma = {
      generatedCreative: {
        findUniqueOrThrow: async () => ({
          id: 'creative-1',
          koreanText: input.koreanText,
          localizations: (input.localizations ?? []).map((text, index) => ({
            id: `localization-${index + 1}`,
            creativeId: 'creative-1',
            locale: 'zh-TW',
            kind: 'AI_DRAFT',
            text,
            notes: null,
            reviewerId: null,
            provider: 'mock',
            model: 'mock-text-1',
            createdAt: new Date(0),
          })),
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          creativeUpdates.push(data);
          return { id: 'creative-1', ...data };
        },
      },
      policyCheck: {
        create: async ({ data }: { data: (typeof checks)[number] }) => {
          checks.push(data);
          return { id: `check-${checks.length}`, createdAt: new Date(0), ...data };
        },
      },
    } as unknown as PrismaService;
    const vectors = {
      searchSimilar: async () =>
        input.similarity === undefined
          ? []
          : [{ sourceAdId: 'source-ad-1', similarity: input.similarity }],
    } as unknown as VectorSearchRepository;
    const embedder: EmbeddingProvider = {
      name: 'test-embedding',
      model: 'test-embedding-1',
      dimension: 3,
      embed: async () => [1, 0, 0],
    };
    return {
      service: new PolicyCheckService(prisma, vectors, embedder),
      checks,
      creativeUpdates,
    };
  }

  it('깨끗한 문구는 검사 3종을 모두 PASS로 기록한다', async () => {
    const { service, checks, creativeUpdates } = harness({
      koreanText: '캐릭터와 새로운 이야기를 시작하세요',
      similarity: 0.4,
    });

    await expect(service.runAll('creative-1')).resolves.toEqual({ minorFlagged: false });
    expect(checks.map(({ checkType, status }) => ({ checkType, status }))).toEqual([
      { checkType: 'BANNED_TERM', status: 'PASS' },
      { checkType: 'SIMILARITY', status: 'PASS' },
      { checkType: 'MINOR_SIGNAL', status: 'PASS' },
    ]);
    expect(creativeUpdates).toEqual([]);
  });

  it('금지어·고유사도는 WARN이고 미성년 신호는 설정 없이 하드 플래그한다', async () => {
    const { service, checks, creativeUpdates } = harness({
      koreanText: '교복 캐릭터와 만나면 100% 보장',
      localizations: ['校服角色'],
      similarity: 0.95,
    });

    await expect(service.runAll('creative-1')).resolves.toEqual({ minorFlagged: true });
    expect(checks).toEqual([
      expect.objectContaining({
        checkType: 'BANNED_TERM',
        status: 'WARN',
        detail: { hits: ['100% 보장'] },
      }),
      expect.objectContaining({
        checkType: 'SIMILARITY',
        status: 'WARN',
        detail: {
          topSimilarity: 0.95,
          threshold: 0.9,
          nearestSourceAdId: 'source-ad-1',
        },
      }),
      expect.objectContaining({
        checkType: 'MINOR_SIGNAL',
        status: 'FLAGGED',
        detail: { hits: ['교복'] },
      }),
    ]);
    expect(creativeUpdates).toEqual([
      { minorFlagged: true, minorFlagNote: '자동 플래그: 교복' },
    ]);
  });

  it('유사도 임계치와 정확히 같으면 WARN이 아니라 PASS다', async () => {
    const { service, checks } = harness({ koreanText: '경계값 문구', similarity: 0.9 });

    await service.runAll('creative-1');

    expect(checks.find((check) => check.checkType === 'SIMILARITY')?.status).toBe('PASS');
  });
});
