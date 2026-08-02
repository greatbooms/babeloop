import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GraphQLError } from 'graphql';
import { Prisma, User } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { adNameFor, buildTrackingCode, utmContentFor } from '../../common/tracking-code';

interface ManifestRow extends Prisma.InputJsonObject {
  trackingCode: string;
  adName: string;
  utmContent: string;
  filename: string;
  imageFilenames: string;
  videoFilenames: string;
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
                brief: {
                  include: { images: { orderBy: { createdAt: 'asc' } } },
                },
                localizations: { orderBy: { createdAt: 'desc' } },
                images: { orderBy: { createdAt: 'asc' } },
                videos: { orderBy: { createdAt: 'asc' } },
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
      const imageFiles: Array<{ filename: string; key: string }> = [];
      const sourceImages =
        creative.type === 'COPY' && creative.images.length > 0
          ? creative.images
          : creative.brief.images;
      for (const [index, image] of sourceImages.entries()) {
        const imageFilename = `${trackingCode}-IMG${index + 1}.png`;
        const imageKey = `${storagePrefix}${imageFilename}`;
        const imageBuffer = await this.storage.getBuffer(image.storageKey);
        await this.storage.putBuffer(imageKey, imageBuffer, image.contentType);
        imageFiles.push({ filename: imageFilename, key: imageKey });
      }
      const imageFilenames = imageFiles.map((image) => image.filename);
      const videoFiles: Array<{ filename: string; key: string }> = [];
      for (const [index, video] of creative.videos.entries()) {
        const videoFilename = `${trackingCode}-VID${index + 1}.mp4`;
        const videoKey = `${storagePrefix}${videoFilename}`;
        const videoBuffer = await this.storage.getBuffer(video.storageKey);
        await this.storage.putBuffer(videoKey, videoBuffer, video.contentType);
        videoFiles.push({ filename: videoFilename, key: videoKey });
      }
      const videoFilenames = videoFiles.map((video) => video.filename);
      const body = [
        `추적코드: ${trackingCode}`,
        `광고명(권장): ${adName}`,
        `UTM: ${utmContent}`,
        `이미지: ${imageFilenames.length > 0 ? imageFilenames.join(' ') : '없음'}`,
        `영상: ${videoFilenames.length > 0 ? videoFilenames.join(' ') : '없음'}`,
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
      await this.prisma.experimentVariant.update({
        where: { id: variant.id },
        data: { exportedAt: new Date() },
      });
      await this.prisma.reviewRequest.create({
        data: {
          creativeId: creative.id,
          kind: 'EXPORTED',
          actorId: user.id,
          note: `experiment=${experiment.code}; tracking=${trackingCode}`,
        },
      });
      manifest.push({
        trackingCode,
        adName,
        utmContent,
        filename,
        imageFilenames: imageFilenames.join(';'),
        videoFilenames: videoFilenames.join(';'),
      });
      files.push({ trackingCode, filename, url: await this.storage.presignGet(key) });
      for (const image of imageFiles) {
        files.push({
          trackingCode,
          filename: image.filename,
          url: await this.storage.presignGet(image.key),
        });
      }
      for (const video of videoFiles) {
        files.push({
          trackingCode,
          filename: video.filename,
          url: await this.storage.presignGet(video.key),
        });
      }
    }

    const manifestBody = [
      '# 규칙: 광고 1개에 소재 1개만 연결할 것 (Dynamic Creative 금지 — 소재 단위 성과 분석 불가)',
      'trackingCode,adName,utmContent,filename,imageFilenames,videoFilenames',
      ...manifest.map((row) =>
        [row.trackingCode, row.adName, row.utmContent, row.filename, row.imageFilenames, row.videoFilenames]
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
