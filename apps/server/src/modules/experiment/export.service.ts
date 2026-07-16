import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GraphQLError } from 'graphql';
import { Prisma, User } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { adNameFor, buildTrackingCode, utmContentFor } from '../../common/tracking-code';
import { assertTransition } from '../review/creative-state-machine';

interface ManifestRow extends Prisma.InputJsonObject {
  trackingCode: string;
  adName: string;
  utmContent: string;
  filename: string;
}

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async exportExperiment(user: User, experimentId: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        variants: {
          orderBy: { createdAt: 'asc' },
          include: {
            creative: {
              include: {
                brief: true,
                localizations: { orderBy: { createdAt: 'desc' } },
              },
            },
          },
        },
      },
    });
    if (!experiment) throw new NotFoundException('실험을 찾을 수 없습니다');
    const targets = experiment.variants.filter((variant) => variant.creative.status === 'APPROVED');
    if (targets.length === 0) {
      throw new GraphQLError('내보낼 승인된 소재가 없습니다', {
        extensions: { code: 'NO_APPROVED_CREATIVES' },
      });
    }

    const packageId = randomUUID();
    const storagePrefix = `exports/${packageId}/`;
    const manifest: ManifestRow[] = [];
    const files: Array<{ trackingCode: string; filename: string; url: string }> = [];

    for (const variant of targets) {
      const creative = variant.creative;
      const trackingCode = buildTrackingCode({
        experimentCode: experiment.code,
        variantCode: variant.variantCode,
        revision: creative.revision,
      });
      await this.prisma.experimentVariant.update({
        where: { id: variant.id },
        data: { trackingCode },
      });
      const approved = creative.localizations.find(
        (item) => item.locale === 'zh-TW' && item.kind === 'APPROVED',
      );
      if (!approved) {
        throw new GraphQLError(`승인된 zh-TW 현지화가 없습니다: ${creative.id}`, {
          extensions: { code: 'NO_APPROVED_LOCALIZATION' },
        });
      }
      const adName = adNameFor(trackingCode, creative.hookType);
      const utmContent = utmContentFor(trackingCode);
      const filename = `${trackingCode}.txt`;
      const body = [
        `추적코드: ${trackingCode}`,
        `광고명(권장): ${adName}`,
        `UTM: ${utmContent}`,
        '규칙: 광고 1개에 소재 1개만 연결할 것 (Dynamic Creative 금지 — 소재 단위 성과 분석 불가)',
        '',
        '--- zh-TW 승인본 ---',
        approved.text,
        '',
        '--- 한국어 원문 (참고용) ---',
        creative.koreanText,
      ].join('\n');
      const key = `${storagePrefix}${filename}`;
      await this.storage.putBuffer(key, Buffer.from(body, 'utf8'), 'text/plain; charset=utf-8');
      assertTransition(
        {
          creative: {
            status: creative.status,
            createdById: creative.createdById,
            lastEditedById: creative.lastEditedById,
            minorFlagged: creative.minorFlagged,
            locale: creative.brief.locale,
          },
          actor: { id: user.id, role: user.role },
        },
        'EXPORTED',
      );
      await this.prisma.generatedCreative.update({
        where: { id: creative.id },
        data: { status: 'EXPORTED' },
      });
      await this.prisma.reviewRequest.create({
        data: {
          creativeId: creative.id,
          kind: 'EXPORTED',
          actorId: user.id,
          note: trackingCode,
        },
      });
      manifest.push({ trackingCode, adName, utmContent, filename });
      files.push({ trackingCode, filename, url: await this.storage.presignGet(key) });
    }

    const manifestBody = [
      '# 규칙: 광고 1개에 소재 1개만 연결할 것 (Dynamic Creative 금지 — 소재 단위 성과 분석 불가)',
      'trackingCode,adName,utmContent,filename',
      ...manifest.map((row) =>
        [row.trackingCode, row.adName, row.utmContent, row.filename]
          .map((value) => this.csvCell(value))
          .join(','),
      ),
    ].join('\n');
    const manifestKey = `${storagePrefix}manifest.csv`;
    await this.storage.putBuffer(
      manifestKey,
      Buffer.from(manifestBody, 'utf8'),
      'text/csv; charset=utf-8',
    );
    const createdPackage = await this.prisma.exportPackage.create({
      data: {
        id: packageId,
        experimentId,
        storagePrefix,
        manifest,
        createdById: user.id,
      },
    });
    return {
      package: { ...createdPackage, manifestJson: JSON.stringify(createdPackage.manifest) },
      files,
      manifestUrl: await this.storage.presignGet(manifestKey),
    };
  }

  async findPackages(experimentId: string) {
    const packages = await this.prisma.exportPackage.findMany({
      where: { experimentId },
      orderBy: { createdAt: 'desc' },
    });
    return packages.map((item) => ({ ...item, manifestJson: JSON.stringify(item.manifest) }));
  }

  private csvCell(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }
}
