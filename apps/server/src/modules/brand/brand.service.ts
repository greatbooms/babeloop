import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBrandInput, UpdateBrandInput } from './brand.inputs';

const BRAND_INCLUDE = { features: true, guidelines: true } as const;

@Injectable()
export class BrandService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.brand.findMany({ include: BRAND_INCLUDE, orderBy: { createdAt: 'asc' } });
  }

  async findById(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id }, include: BRAND_INCLUDE });
    if (!brand) throw new NotFoundException('브랜드를 찾을 수 없습니다');
    return brand;
  }

  create(input: CreateBrandInput) {
    return this.prisma.brand.create({
      data: {
        name: input.name,
        serviceUrl: input.serviceUrl,
        description: input.description,
        features: { create: input.features },
      },
      include: BRAND_INCLUDE,
    });
  }

  async update(input: UpdateBrandInput) {
    await this.findById(input.id);
    return this.prisma.brand.update({
      where: { id: input.id },
      data: { name: input.name ?? undefined, serviceUrl: input.serviceUrl, description: input.description },
      include: BRAND_INCLUDE,
    });
  }
}
