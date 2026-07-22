import { BrandService } from './brand.service';

describe('BrandService feature and guideline management', () => {
  it('브랜드 기능을 추가한다', async () => {
    const prisma = {
      brand: { findUnique: jest.fn().mockResolvedValue({ id: 'brand-1' }), update: jest.fn() },
      brandFeature: { create: jest.fn().mockResolvedValue({ id: 'feature-1' }) },
    };
    const service = new BrandService(prisma as never, {} as never, {} as never);

    await service.addFeature('brand-1', '빠른 매칭', '관심사를 바탕으로 연결합니다');

    expect(prisma.brandFeature.create).toHaveBeenCalledWith({
      data: { brandId: 'brand-1', name: '빠른 매칭', description: '관심사를 바탕으로 연결합니다' },
    });
    expect(prisma.brand.update).toHaveBeenCalledWith({ where: { id: 'brand-1' }, data: { updatedAt: expect.any(Date) } });
  });

  it('브랜드 가이드라인을 추가하고 삭제한다', async () => {
    const prisma = {
      brand: { findUnique: jest.fn().mockResolvedValue({ id: 'brand-1' }), update: jest.fn() },
      brandGuideline: {
        create: jest.fn().mockResolvedValue({ id: 'guide-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'guide-1', brandId: 'brand-1' }),
      },
    };
    const service = new BrandService(prisma as never, {} as never, {} as never);

    await service.addGuideline('brand-1', '말투', '따뜻하고 직접적으로 씁니다');
    await expect(service.deleteGuideline('guide-1')).resolves.toBe(true);

    expect(prisma.brandGuideline.create).toHaveBeenCalledWith({
      data: { brandId: 'brand-1', title: '말투', content: '따뜻하고 직접적으로 씁니다' },
    });
  });
});

describe('BrandService Traditional Chinese translation', () => {
  it('translate-brand--{id} 잡을 enqueueOrRetry로 등록한다', async () => {
    const prisma = { brand: { findUnique: jest.fn().mockResolvedValue({ id: 'brand-1', features: [], guidelines: [] }) } };
    const queue = { name: 'creative-generation' };
    const jobRecord = { enqueueOrRetry: jest.fn().mockResolvedValue({ id: 'translate-brand--brand-1' }) };
    const service = new BrandService(prisma as never, jobRecord as never, queue as never);

    await expect(service.translateZhTw('brand-1')).resolves.toEqual({ id: 'translate-brand--brand-1' });
    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(queue, 'creative-generation', 'translate-brand', 'translate-brand--brand-1', { brandId: 'brand-1' });
  });

  it('저장된 번체중문을 GraphQL JSON 문자열로 매핑한다', async () => {
    const zhTw = { description: '[MOCK 繁中] 品牌介紹', features: [], guidelines: [] };
    const translatedAt = new Date('2026-07-22T12:00:00.000Z');
    const prisma = { brand: { findUnique: jest.fn().mockResolvedValue({ id: 'brand-1', name: '브랜드', features: [], guidelines: [], zhTw, zhTwTranslatedAt: translatedAt, updatedAt: translatedAt }) } };
    const service = new BrandService(prisma as never, {} as never, {} as never);

    await expect(service.findById('brand-1')).resolves.toEqual(expect.objectContaining({ zhTwJson: JSON.stringify(zhTw), zhTwTranslatedAt: translatedAt }));
  });
});
