import { Module } from '@nestjs/common';
import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { ExperimentResolver } from './experiment.resolver';
import { ExperimentService } from './experiment.service';
import { ExportService } from './export.service';

@Module({
  imports: [AuthModule, StorageModule],
  providers: [ExperimentService, ExportService, ExperimentResolver],
})
export class ExperimentModule {}
