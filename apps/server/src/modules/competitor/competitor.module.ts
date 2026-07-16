import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompetitorResolver } from './competitor.resolver';
import { CompetitorService } from './competitor.service';

@Module({ imports: [AuthModule], providers: [CompetitorService, CompetitorResolver] })
export class CompetitorModule {}
