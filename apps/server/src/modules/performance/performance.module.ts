import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PerformanceResolver } from './performance.resolver';
import { PerformanceService } from './performance.service';

@Module({
  imports: [AuthModule],
  providers: [PerformanceService, PerformanceResolver],
  exports: [PerformanceService],
})
export class PerformanceModule {}
