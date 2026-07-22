import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CREATIVE_GENERATION_QUEUE } from '../../queues/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { BrandResolver } from './brand.resolver';
import { BrandService } from './brand.service';

@Module({ imports: [AuthModule, BullModule.registerQueue({ name: CREATIVE_GENERATION_QUEUE })], providers: [BrandService, BrandResolver] })
export class BrandModule {}
