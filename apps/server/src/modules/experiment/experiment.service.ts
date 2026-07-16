import { Injectable, NotFoundException } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { Prisma } from '../../../generated/prisma';
import { buildTrackingCode, EXPERIMENT_CODE_RE } from '../../common/tracking-code';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AddCreativeToExperimentInput, CreateExperimentInput } from './experiment.inputs';

export const EXPERIMENT_INCLUDE = {
  variants: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      creative: {
        select: {
          id: true,
          koreanText: true,
          status: true,
          revision: true,
          hookType: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class ExperimentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateExperimentInput) {
    if (!EXPERIMENT_CODE_RE.test(input.code)) {
      throw new GraphQLError('실험 코드는 대문자·숫자 2~8자여야 합니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const existing = await this.prisma.experiment.findUnique({ where: { code: input.code } });
    if (existing) this.duplicate('이미 사용 중인 실험 코드입니다');
    try {
      return await this.prisma.experiment.create({ data: input, include: EXPERIMENT_INCLUDE });
    } catch (error) {
      if (this.isUniqueViolation(error)) this.duplicate('이미 사용 중인 실험 코드입니다');
      throw error;
    }
  }

  async addCreative(input: AddCreativeToExperimentInput) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: input.experimentId },
      include: { variants: true },
    });
    if (!experiment) throw new NotFoundException('실험을 찾을 수 없습니다');
    const creative = await this.prisma.generatedCreative.findUnique({
      where: { id: input.creativeId },
    });
    if (!creative) throw new NotFoundException('생성물을 찾을 수 없습니다');
    if (creative.status !== 'APPROVED') {
      throw new GraphQLError('승인된 소재만 실험에 추가할 수 있습니다', {
        extensions: { code: 'NOT_APPROVED' },
      });
    }
    const duplicate = experiment.variants.some((item) => item.creativeId === input.creativeId);
    if (duplicate) this.duplicate('이미 이 실험에 추가된 소재입니다');
    const variantCode = `V${experiment.variants.length + 1}`;
    const trackingCode = buildTrackingCode({
      experimentCode: experiment.code,
      variantCode,
      revision: creative.revision,
    });
    try {
      return await this.prisma.experimentVariant.create({
        data: {
          experimentId: experiment.id,
          creativeId: creative.id,
          variantCode,
          trackingCode,
        },
        include: {
          creative: {
            select: {
              id: true,
              koreanText: true,
              status: true,
              revision: true,
              hookType: true,
            },
          },
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) this.duplicate('이미 추가된 소재 또는 변형 코드입니다');
      throw error;
    }
  }

  findAll() {
    return this.prisma.experiment.findMany({
      include: EXPERIMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  private duplicate(message: string): never {
    throw new GraphQLError(message, { extensions: { code: 'DUPLICATE' } });
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
