import { Module } from '@nestjs/common';
import { PolicyCheckService } from './policy-check.service';

@Module({
  providers: [PolicyCheckService],
  exports: [PolicyCheckService],
})
export class PolicyModule {}
