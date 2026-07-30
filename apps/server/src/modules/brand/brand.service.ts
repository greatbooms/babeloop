import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CREATIVE_GENERATION_QUEUE, JOB_TYPES, translateBrandJobId } from '../../queues/queue.constants';
import { JobRecordService } from '../jobs/job-record.service';
import { CreateBrandInput, UpdateBrandInput } from './brand.inputs';

const BRAND_INCLUDE = { features: true, guidelines: true } as const;

@Injectable()
export class BrandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRecord: JobRecordService,
    @InjectQueue(CREATIVE_GENERATION_QUEUE) private readonly queue: Queue,
  ) {}

  private mapBrand<T extends { zhTw?: unknown; koFields?: unknown }>(brand: T) {
    return { ...brand, zhTwJson: brand.zhTw ? JSON.stringify(brand.zhTw) : null, koJson: brand.koFields ? JSON.stringify(brand.koFields) : null };
  }

  async findAll() {
    const brands = await this.prisma.brand.findMany({ include: BRAND_INCLUDE, orderBy: { createdAt: 'asc' } });
    return brands.map((brand) => this.mapBrand(brand));
  }

  async findById(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id }, include: BRAND_INCLUDE });
    if (!brand) throw new NotFoundException('브랜드를 찾을 수 없습니다');
    return this.mapBrand(brand);
  }

  async create(input: CreateBrandInput) {
    const brand = await this.prisma.brand.create({
      data: {
        name: input.name,
        serviceUrl: input.serviceUrl,
        description: input.description,
        features: { create: input.features },
      },
      include: BRAND_INCLUDE,
    });
    return this.mapBrand(brand);
  }

  async update(input: UpdateBrandInput) {
    await this.findById(input.id);
    const brand = await this.prisma.brand.update({
      where: { id: input.id },
      data: { name: input.name ?? undefined, serviceUrl: input.serviceUrl, description: input.description },
      include: BRAND_INCLUDE,
    });
    return this.mapBrand(brand);
  }

  async translateZhTw(brandId: string) {
    await this.findById(brandId);
    const jobId = translateBrandJobId(brandId);
    return this.jobRecord.enqueueOrRetry(this.queue, CREATIVE_GENERATION_QUEUE, JOB_TYPES.TRANSLATE_BRAND, jobId, { brandId });
  }

  async addFeature(brandId: string, name: string, description: string) {
    await this.findById(brandId);
    const feature = await this.prisma.brandFeature.create({ data: { brandId, name, description } });
    await this.prisma.brand.update({ where: { id: brandId }, data: { updatedAt: new Date() } });
    return feature;
  }

  async deleteFeature(id: string): Promise<boolean> {
    const feature = await this.prisma.brandFeature.delete({ where: { id } });
    await this.prisma.brand.update({ where: { id: feature.brandId }, data: { updatedAt: new Date() } });
    return true;
  }

  async addGuideline(brandId: string, title: string, content: string) {
    await this.findById(brandId);
    const guideline = await this.prisma.brandGuideline.create({ data: { brandId, title, content } });
    await this.prisma.brand.update({ where: { id: brandId }, data: { updatedAt: new Date() } });
    return guideline;
  }

  async deleteGuideline(id: string): Promise<boolean> {
    const guideline = await this.prisma.brandGuideline.delete({ where: { id } });
    await this.prisma.brand.update({ where: { id: guideline.brandId }, data: { updatedAt: new Date() } });
    return true;
  }
}
