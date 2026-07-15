import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobRecordService } from './job-record.service';
import { JobsResolver } from './jobs.resolver';

@Global()
@Module({ imports: [AuthModule], providers: [JobRecordService, JobsResolver], exports: [JobRecordService] })
export class JobsModule {}
