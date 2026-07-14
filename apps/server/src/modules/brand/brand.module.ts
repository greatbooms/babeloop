import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BrandResolver } from './brand.resolver';
import { BrandService } from './brand.service';

@Module({ imports: [AuthModule], providers: [BrandService, BrandResolver] })
export class BrandModule {}
