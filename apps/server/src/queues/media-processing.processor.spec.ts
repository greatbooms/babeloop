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
