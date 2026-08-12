import { JOB_TYPES } from './queue.constants';
import { MediaProcessingProcessor } from './media-processing.processor';

jest.mock('../common/media/video-thumbnail', () => ({
  extractVideoThumbnail: jest.fn().mockResolvedValue(Buffer.from('jpeg')),
}));

describe('MediaProcessingProcessor GENERATE_THUMBNAIL', () => {
  it('원본을 읽어 JPEG를 저장하고 thumbnailKey만 갱신하며 STT를 호출하지 않는다', async () => {
    const prisma = {
      mediaAsset: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'video-1',
          kind: 'VIDEO',
          storageKey: 'media/video-1',
          thumbnailKey: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const storage = {
      getBuffer: jest.fn().mockResolvedValue(Buffer.from('video')),
      putBuffer: jest.fn().mockResolvedValue(undefined),
    };
    const jobRecord = {
      markRunning: jest.fn(),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
    };
    const stt = { transcribe: jest.fn(), name: 'stt', model: 'stt' };
    const processor = new MediaProcessingProcessor(
      prisma as never,
      storage as never,
      {} as never,
      jobRecord as never,
      {} as never,
      stt as never,
    );

    await processor.process({
      id: 'generate-thumbnail--video-1',
      name: JOB_TYPES.GENERATE_THUMBNAIL,
      data: { mediaAssetId: 'video-1' },
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as never);

    expect(storage.putBuffer).toHaveBeenCalledWith('media/video-1.thumb.jpg', Buffer.from('jpeg'), 'image/jpeg');
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'video-1' },
      data: { thumbnailKey: 'media/video-1.thumb.jpg' },
    });
    expect(stt.transcribe).not.toHaveBeenCalled();
  });
});

describe('MediaProcessingProcessor PROCESS_MEDIA 재추출', () => {
  it('이미지 재추출 시 OCR과 비주얼 묘사를 한 트랜잭션에서 새 결과로 교체한다', async () => {
    const prisma = {
      mediaAsset: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'image-1',
          kind: 'IMAGE',
          storageKey: 'media/image-1',
          contentType: 'image/png',
          originalFilename: 'image-1.png',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      ocrResult: {
        deleteMany: jest.fn().mockReturnValue('ocr-del'),
        create: jest.fn().mockReturnValue('ocr-crt'),
      },
      visualDescription: {
        deleteMany: jest.fn().mockReturnValue('visual-del'),
        create: jest.fn().mockReturnValue('visual-crt'),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const storage = { getBuffer: jest.fn().mockResolvedValue(Buffer.from('png')) };
    const jobRecord = { markRunning: jest.fn(), markSucceeded: jest.fn(), markFailed: jest.fn() };
    const aiLog = { record: jest.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()) };
    const ocr = {
      extractText: jest.fn().mockResolvedValue({ text: '새 텍스트' }),
      describe: jest.fn().mockResolvedValue({ text: '[MOCK 비주얼] 광고 이미지 묘사', costEstimateUsd: 0.01 }),
      name: 'ocr',
      model: 'ocr-1',
    };
    const processor = new MediaProcessingProcessor(
      prisma as never,
      storage as never,
      aiLog as never,
      jobRecord as never,
      ocr as never,
      {} as never,
    );

    await processor.process({
      id: 'process-media--image-1',
      name: JOB_TYPES.PROCESS_MEDIA,
      data: { mediaAssetId: 'image-1' },
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as never);

    expect(prisma.ocrResult.deleteMany).toHaveBeenCalledWith({ where: { mediaAssetId: 'image-1' } });
    expect(prisma.ocrResult.create).toHaveBeenCalledWith({
      data: { mediaAssetId: 'image-1', text: '새 텍스트', provider: 'ocr', model: 'ocr-1' },
    });
    expect(prisma.visualDescription.deleteMany).toHaveBeenCalledWith({ where: { mediaAssetId: 'image-1' } });
    expect(prisma.visualDescription.create).toHaveBeenCalledWith({
      data: {
        mediaAssetId: 'image-1',
        text: '[MOCK 비주얼] 광고 이미지 묘사',
        provider: 'ocr',
        model: 'ocr-1',
        promptVersion: 'describe-visual@v1',
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['ocr-del', 'ocr-crt', 'visual-del', 'visual-crt']);
    expect(aiLog.record).toHaveBeenCalledTimes(2);
  });
});
