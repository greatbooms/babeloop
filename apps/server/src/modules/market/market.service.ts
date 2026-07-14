import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.market.findMany({ orderBy: { code: 'asc' } });
  }
}
