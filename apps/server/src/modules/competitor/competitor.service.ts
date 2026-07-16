import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCompetitorInput } from './competitor.inputs';

@Injectable()
export class CompetitorService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.competitor.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async create(input: CreateCompetitorInput) {
    const existing = await this.prisma.competitor.findUnique({ where: { name: input.name } });
    if (existing) {
      throw new GraphQLError('이미 등록된 경쟁사입니다', { extensions: { code: 'DUPLICATE' } });
    }
    return this.prisma.competitor.create({
      data: { name: input.name, category: input.category, notes: input.notes },
    });
  }
}
