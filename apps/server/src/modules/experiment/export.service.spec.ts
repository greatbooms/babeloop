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
      type: 'COPY',
      images: [],
      videos: [],
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
    expect(textWrite?.[1].toString('utf8')).toContain('영상: 없음');
    const manifestWrite = storage.putBuffer.mock.calls.find(
      ([key]: [string]) => key.endsWith('/manifest.csv'),
    );
    const manifestBody = manifestWrite?.[1].toString('utf8');
    expect(manifestBody).toContain(
      'trackingCode,adName,utmContent,filename,imageFilenames,videoFilenames',
    );
    expect(manifestBody).toContain('"BL-TW01-V1-R1-IMG1.png"');
    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'BL-TW01-V1-R1.txt' }),
        expect.objectContaining({ filename: 'BL-TW01-V1-R1-IMG1.png' }),
      ]),
    );
  });

  it('COPY에 문구 전용 이미지가 있으면 브리프 이미지를 제외하고 전용 이미지만 포함한다', async () => {
    const creative = {
      id: 'creative-copy-1',
      type: 'COPY',
      status: 'APPROVED',
      revision: 1,
      hookType: 'HOOK',
      koreanText: '한국어 문구',
      images: [
        { storageKey: 'generated-images/brief-1/copy-only.png', contentType: 'image/png' },
      ],
      videos: [],
      brief: {
        images: [
          { storageKey: 'generated-images/brief-1/shared.png', contentType: 'image/png' },
        ],
      },
      localizations: [{ locale: 'zh-TW', kind: 'APPROVED', text: '核准文案' }],
    };
    const prisma = {
      experiment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'experiment-1',
          code: 'TW01',
          variants: [{ id: 'variant-1', variantCode: 'V1', createdAt: new Date(), creative }],
        }),
      },
      experimentVariant: { update: jest.fn() },
      reviewRequest: { create: jest.fn() },
      exportPackage: { create: jest.fn(async ({ data }) => ({ ...data, createdAt: new Date() })) },
    };
    const storage = {
      getBuffer: jest.fn().mockResolvedValue(Buffer.from('copy-image')),
      putBuffer: jest.fn(),
      presignGet: jest.fn(async (key: string) => `signed:${key}`),
    };
    const service = new ExportService(prisma as never, storage as never);

    await service.exportExperiment(
      { id: 'reviewer-1', role: 'REVIEWER' } as never,
      'experiment-1',
    );

    expect(storage.getBuffer).toHaveBeenCalledWith('generated-images/brief-1/copy-only.png');
    expect(storage.getBuffer).not.toHaveBeenCalledWith('generated-images/brief-1/shared.png');
  });

  it('생성된 영상을 MP4 파일·지시서·manifest에 포함한다', async () => {
    const videoBuffer = Buffer.from('mp4-bytes');
    const creative = {
      id: 'creative-video-1',
      type: 'VIDEO_SCRIPT',
      status: 'APPROVED',
      revision: 2,
      hookType: 'STORY',
      koreanText: '장면표 원문',
      images: [],
      videos: [
        { storageKey: 'generated-videos/creative-video-1/video.mp4', contentType: 'video/mp4' },
      ],
      brief: { images: [] },
      localizations: [{ locale: 'zh-TW', kind: 'APPROVED', text: '核准分鏡' }],
    };
    const prisma = {
      experiment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'experiment-1',
          code: 'TW01',
          variants: [{ id: 'variant-1', variantCode: 'V2', createdAt: new Date(), creative }],
        }),
      },
      experimentVariant: { update: jest.fn() },
      reviewRequest: { create: jest.fn() },
      exportPackage: { create: jest.fn(async ({ data }) => ({ ...data, createdAt: new Date() })) },
    };
    const storage = {
      getBuffer: jest.fn().mockResolvedValue(videoBuffer),
      putBuffer: jest.fn(),
      presignGet: jest.fn(async (key: string) => `signed:${key}`),
    };
    const service = new ExportService(prisma as never, storage as never);

    const result = await service.exportExperiment(
      { id: 'reviewer-1', role: 'REVIEWER' } as never,
      'experiment-1',
    );

    expect(storage.getBuffer).toHaveBeenCalledWith('generated-videos/creative-video-1/video.mp4');
    expect(storage.putBuffer).toHaveBeenCalledWith(
      expect.stringMatching(/^exports\/[0-9a-f-]+\/BL-TW01-V2-R2-VID1\.mp4$/),
      videoBuffer,
      'video/mp4',
    );
    const textWrite = storage.putBuffer.mock.calls.find(
      ([key]: [string]) => key.endsWith('/BL-TW01-V2-R2.txt'),
    );
    expect(textWrite?.[1].toString('utf8')).toContain('영상: BL-TW01-V2-R2-VID1.mp4');
    const manifestWrite = storage.putBuffer.mock.calls.find(
      ([key]: [string]) => key.endsWith('/manifest.csv'),
    );
    expect(manifestWrite?.[1].toString('utf8')).toContain('"BL-TW01-V2-R2-VID1.mp4"');
    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'BL-TW01-V2-R2-VID1.mp4' }),
      ]),
    );
  });
});
