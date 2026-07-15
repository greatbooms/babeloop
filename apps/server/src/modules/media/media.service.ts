import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import { GraphQLError } from 'graphql';
import { User } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { JobRecordService } from '../jobs/job-record.service';
import { JOB_TYPES, MEDIA_PROCESSING_QUEUE, processMediaJobId } from '../../queues/queue.constants';
import { CompleteMediaUploadInput, RequestMediaUploadInput } from './media.inputs';

const MEDIA_INCLUDE = { ocrResults: true, transcriptions: true } as const;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobRecord: JobRecordService,
    @InjectQueue(MEDIA_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  async requestUpload(user: User, input: RequestMediaUploadInput) {
    const expectedPrefix = input.kind === 'IMAGE' ? 'image/' : 'video/';
    if (!input.contentType.startsWith(expectedPrefix)) {
      throw new GraphQLError(`${input.kind} 업로드의 contentType은 ${expectedPrefix}* 이어야 합니다`, {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const safeName = input.filename.replace(/[^\w.\-가-힣]/g, '_');
    const storageKey = `media/${randomUUID()}/${safeName}`;
    const mediaAsset = await this.prisma.mediaAsset.create({
      data: {
        kind: input.kind,
        originalFilename: input.filename,
        contentType: input.contentType,
        storageKey,
        uploadedById: user.id,
      },
      include: MEDIA_INCLUDE,
    });
    const uploadUrl = await this.storage.presignPut(storageKey, input.contentType);
    return { uploadUrl, mediaAsset };
  }

  async completeUpload(input: CompleteMediaUploadInput) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: input.mediaAssetId } });
    if (!asset) throw new NotFoundException('미디어 자산을 찾을 수 없습니다');

    const head = await this.storage.head(asset.storageKey);
    if (!head) {
      throw new GraphQLError('업로드가 완료되지 않았습니다 — 파일을 먼저 업로드하세요', {
        extensions: { code: 'UPLOAD_NOT_FOUND' },
      });
    }

    const buffer = await this.storage.getBuffer(asset.storageKey);
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const duplicate = await this.prisma.mediaAsset.findFirst({
      where: { contentHash, id: { not: asset.id } },
      orderBy: { createdAt: 'asc' },
    });

    const mediaAsset = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: 'UPLOADED',
        sizeBytes: head.sizeBytes,
        contentHash,
        duplicateOfId: duplicate?.id ?? null,
      },
      include: MEDIA_INCLUDE,
    });

    const jobId = processMediaJobId(asset.id);
    await this.queue.add(
      JOB_TYPES.PROCESS_MEDIA,
      { mediaAssetId: asset.id },
      { jobId, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: false },
    );
    const job = await this.jobRecord.enqueue(jobId, MEDIA_PROCESSING_QUEUE, JOB_TYPES.PROCESS_MEDIA, {
      mediaAssetId: asset.id,
    });

    return { mediaAsset, job };
  }

  findAll() {
    return this.prisma.mediaAsset.findMany({ include: MEDIA_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async findById(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id }, include: MEDIA_INCLUDE });
    if (!asset) throw new NotFoundException('미디어 자산을 찾을 수 없습니다');
    return asset;
  }
}
