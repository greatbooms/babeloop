import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  downloadExternalMediaJobId,
  JOB_TYPES,
  MEDIA_PROCESSING_QUEUE,
} from '../../queues/queue.constants';
import { JobRecordService } from '../jobs/job-record.service';
import { parseSensorTowerCreativeGalleryCsv } from './sensortower-csv.parser';

export interface ImportResult {
  importedCount: number;
  duplicateCount: number;
  errors: string[];
}

@Injectable()
export class CsvImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRecord: JobRecordService,
    @InjectQueue(MEDIA_PROCESSING_QUEUE) private readonly mediaQueue: Queue,
  ) {}

  async importSensorTowerCsv(fileBase64: string, competitorId?: string): Promise<ImportResult> {
    const { rows, errors } = parseSensorTowerCreativeGalleryCsv(Buffer.from(fileBase64, 'base64'));
    let importedCount = 0;
    let duplicateCount = 0;

    for (const row of rows) {
      const existing = await this.prisma.sourceAd.findUnique({ where: { externalId: row.creativeUrl } });
      if (existing) {
        duplicateCount++;
        continue;
      }
      const ad = await this.prisma.sourceAd.create({
        data: {
          origin: 'SENSOR_TOWER_CSV',
          competitorId: competitorId ?? null,
          title: `${row.advertiserAppName} — ${row.type}`,
          sourceUrl: row.creativeUrl,
          externalId: row.creativeUrl,
          networks: row.networks,
          countries: row.countries,
          firstSeenAt: row.firstSeen,
          lastSeenAt: row.lastSeen,
          impressionShare: row.impressionShare,
          provider: 'sensortower-csv',
          observedAt: row.lastSeen,
          isEstimated: true,
          confidence: 'MEDIUM',
        },
      });
      importedCount++;

      const jobId = downloadExternalMediaJobId(ad.id);
      await this.mediaQueue.add(
        JOB_TYPES.DOWNLOAD_EXTERNAL_MEDIA,
        { sourceAdId: ad.id, url: row.creativeUrl, type: row.type },
        {
          jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      await this.jobRecord.enqueue(jobId, MEDIA_PROCESSING_QUEUE, JOB_TYPES.DOWNLOAD_EXTERNAL_MEDIA, {
        sourceAdId: ad.id,
      });
    }
    return { importedCount, duplicateCount, errors };
  }
}
