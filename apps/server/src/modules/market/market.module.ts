import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MarketResolver } from './market.resolver';
import { MarketService } from './market.service';

@Module({ imports: [AuthModule], providers: [MarketService, MarketResolver] })
export class MarketModule {}
