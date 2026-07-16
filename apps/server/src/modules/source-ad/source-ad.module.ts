import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CREATIVE_ANALYSIS_QUEUE, MEDIA_PROCESSING_QUEUE } from '../../queues/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { CsvImportService } from './csv-import.service';
import { SourceAdResolver } from './source-ad.resolver';
import { SourceAdService } from './source-ad.service';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: CREATIVE_ANALYSIS_QUEUE }, { name: MEDIA_PROCESSING_QUEUE }),
  ],
  providers: [CsvImportService, SourceAdService, SourceAdResolver],
})
export class SourceAdModule {}
