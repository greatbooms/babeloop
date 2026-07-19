import { MediaService } from './media.service';
import { JOB_TYPES, MEDIA_PROCESSING_QUEUE, processMediaJobId } from '../../queues/queue.constants';

describe('MediaService.processMediaAsset', () => {
  function setup(asset: { id: string; status: string } | null) {
    const prisma = { mediaAsset: { findUnique: jest.fn().mockResolvedValue(asset) } };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const jobRecord = { enqueue: jest.fn().mockResolvedValue({ id: asset ? processMediaJobId(asset.id) : 'none' }) };
    const service = new MediaService(prisma as never, {} as never, jobRecord as never, queue as never);
    return { service, queue, jobRecord };
  }

  it('PENDING 자산은 업로드 미완료 오류로 거부한다', async () => {
    const { service } = setup({ id: 'asset-1', status: 'PENDING' });
    await expect(service.processMediaAsset('asset-1')).rejects.toThrow('업로드 미완료');
  });

  it('READY 자산도 같은 idempotent jobId로 재처리 등록한다', async () => {
    const { service, queue, jobRecord } = setup({ id: 'asset-1', status: 'READY' });

    await service.processMediaAsset('asset-1');

    const payload = { mediaAssetId: 'asset-1' };
    expect(queue.add).toHaveBeenCalledWith(JOB_TYPES.PROCESS_MEDIA, payload, {
      jobId: processMediaJobId('asset-1'),
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    expect(jobRecord.enqueue).toHaveBeenCalledWith(
      processMediaJobId('asset-1'), MEDIA_PROCESSING_QUEUE, JOB_TYPES.PROCESS_MEDIA, payload,
    );
  });
});
