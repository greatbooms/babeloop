import { ExportService } from './export.service';

describe('ExportService brief images', () => {
  it('브리프 이미지를 추적코드 파일명으로 복사하고 지시서·manifest·files에 포함한다', async () => {
    const imageBuffer = Buffer.from('png-bytes');
    const creative = {
      id: 'creative-1',
      status: 'APPROVED',
      revision: 1,
      hookType: 'HOOK',
      createdById: 'editor-1',
      lastEditedById: null,
      minorFlagged: false,
      koreanText: '한국어 문구',
      brief: {
        locale: 'zh-TW',
        images: [
          { storageKey: 'generated-images/brief-1/image.png', contentType: 'image/png' },
        ],
      },
      localizations: [{ locale: 'zh-TW', kind: 'APPROVED', text: '核准文案' }],
    };
    const prisma = {
      experiment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'experiment-1',
          code: 'TW01',
          variants: [
            { id: 'variant-1', variantCode: 'V1', createdAt: new Date(), creative },
          ],
        }),
      },
      experimentVariant: { update: jest.fn() },
      generatedCreative: { update: jest.fn() },
      reviewRequest: { create: jest.fn() },
      exportPackage: {
        create: jest.fn(async ({ data }) => ({ ...data, createdAt: new Date() })),
      },
    };
    const storage = {
      getBuffer: jest.fn().mockResolvedValue(imageBuffer),
      putBuffer: jest.fn(),
      presignGet: jest.fn(async (key: string) => `signed:${key}`),
    };
    const service = new ExportService(prisma as never, storage as never);

    const result = await service.exportExperiment(
      { id: 'reviewer-1', role: 'REVIEWER' } as never,
      'experiment-1',
    );

    expect(storage.getBuffer).toHaveBeenCalledWith('generated-images/brief-1/image.png');
    expect(storage.putBuffer).toHaveBeenCalledWith(
      expect.stringMatching(/^exports\/[0-9a-f-]+\/BL-TW01-V1-R1-IMG1\.png$/),
      imageBuffer,
      'image/png',
    );
    const textWrite = storage.putBuffer.mock.calls.find(
      ([key]: [string]) => key.endsWith('/BL-TW01-V1-R1.txt'),
    );
    expect(textWrite?.[1].toString('utf8')).toContain('이미지: BL-TW01-V1-R1-IMG1.png');
    const manifestWrite = storage.putBuffer.mock.calls.find(
      ([key]: [string]) => key.endsWith('/manifest.csv'),
    );
    const manifestBody = manifestWrite?.[1].toString('utf8');
    expect(manifestBody).toContain(
      'trackingCode,adName,utmContent,filename,imageFilenames',
    );
    expect(manifestBody).toContain('"BL-TW01-V1-R1-IMG1.png"');
    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'BL-TW01-V1-R1.txt' }),
        expect.objectContaining({ filename: 'BL-TW01-V1-R1-IMG1.png' }),
      ]),
    );
  });
});
