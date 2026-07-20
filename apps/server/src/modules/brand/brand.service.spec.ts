import { BrandService } from './brand.service';

describe('BrandService feature and guideline management', () => {
  it('브랜드 기능을 추가한다', async () => {
    const prisma = {
      brand: { findUnique: jest.fn().mockResolvedValue({ id: 'brand-1' }) },
      brandFeature: { create: jest.fn().mockResolvedValue({ id: 'feature-1' }) },
    };
    const service = new BrandService(prisma as never);

    await service.addFeature('brand-1', '빠른 매칭', '관심사를 바탕으로 연결합니다');

    expect(prisma.brandFeature.create).toHaveBeenCalledWith({
      data: { brandId: 'brand-1', name: '빠른 매칭', description: '관심사를 바탕으로 연결합니다' },
    });
  });

  it('브랜드 가이드라인을 추가하고 삭제한다', async () => {
    const prisma = {
      brand: { findUnique: jest.fn().mockResolvedValue({ id: 'brand-1' }) },
      brandGuideline: {
        create: jest.fn().mockResolvedValue({ id: 'guide-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'guide-1' }),
      },
    };
    const service = new BrandService(prisma as never);

    await service.addGuideline('brand-1', '말투', '따뜻하고 직접적으로 씁니다');
    await expect(service.deleteGuideline('guide-1')).resolves.toBe(true);

    expect(prisma.brandGuideline.create).toHaveBeenCalledWith({
      data: { brandId: 'brand-1', title: '말투', content: '따뜻하고 직접적으로 씁니다' },
    });
  });
});
