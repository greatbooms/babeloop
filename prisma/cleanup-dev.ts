import 'dotenv/config';
import { Prisma, PrismaClient } from '../apps/server/generated/prisma';

declare const process: { argv: string[]; exitCode?: number };

const prisma = new PrismaClient();
const confirmed = process.argv.includes('--yes');

async function main() {
  const experiments = await prisma.experiment.findMany({
    where: { name: { startsWith: 'E2E 실험' } },
    select: { id: true },
  });
  const experimentIds = experiments.map(({ id }) => id);

  const briefs = await prisma.creativeBrief.findMany({
    where: { provider: 'mock' },
    select: { id: true, creatives: { select: { id: true } } },
  });
  const briefIds = briefs.map(({ id }) => id);
  const creativeIds = briefs.flatMap(({ creatives }) => creatives.map(({ id }) => id));

  const variants = await prisma.experimentVariant.findMany({
    where: {
      OR: [
        { experimentId: { in: experimentIds } },
        { creativeId: { in: creativeIds } },
      ],
    },
    select: { id: true, trackingCode: true },
  });
  const variantIds = variants.map(({ id }) => id);
  const trackingCodes = variants.map(({ trackingCode }) => trackingCode);

  const sourceAdWhere: Prisma.SourceAdWhereInput = {
    provider: 'manual',
    NOT: { title: '실검증-경쟁광고' },
    OR: [
      { title: { startsWith: 'RAG-' } },
      { title: { startsWith: '훅 테스트' } },
      { title: { startsWith: 'ad-' } },
      { title: { startsWith: 'A-' } },
      { title: { startsWith: 'B-' } },
      { title: { startsWith: 'C-' } },
      { adText: { contains: '완전 상동' } },
      { adText: { contains: '完全相同' } },
    ],
  };

  const brandWhere: Prisma.BrandWhereInput = {
    OR: [
      { name: { startsWith: 'BabeChat-' } },
      { name: 'X' },
    ],
  };
  const mediaWhere: Prisma.MediaAssetWhereInput = {
    originalFilename: 'sample.png',
    sourceAds: { none: {} },
  };

  const targets = {
    creativeBriefs: briefIds.length,
    generatedCreatives: creativeIds.length,
    experiments: experimentIds.length,
    experimentVariants: variantIds.length,
    exportPackages: await prisma.exportPackage.count({ where: { experimentId: { in: experimentIds } } }),
    performanceRows: await prisma.performanceDaily.count({ where: { trackingCode: { in: trackingCodes } } }),
    sourceAds: await prisma.sourceAd.count({ where: sourceAdWhere }),
    brands: await prisma.brand.count({ where: brandWhere }),
    mediaAssets: await prisma.mediaAsset.count({ where: mediaWhere }),
  };

  console.table(targets);
  if (!confirmed) {
    console.log('dry-run입니다. 실제 삭제하려면 pnpm cleanup:dev --yes 를 실행하세요.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.performanceDaily.deleteMany({ where: { trackingCode: { in: trackingCodes } } });
    await tx.exportPackage.deleteMany({ where: { experimentId: { in: experimentIds } } });
    await tx.experimentVariant.deleteMany({ where: { id: { in: variantIds } } });
    await tx.experiment.deleteMany({ where: { id: { in: experimentIds } } });
    await tx.creativeBrief.deleteMany({ where: { id: { in: briefIds } } });
    await tx.sourceAd.deleteMany({ where: sourceAdWhere });
    await tx.brand.deleteMany({ where: brandWhere });
    await tx.mediaAsset.deleteMany({ where: mediaWhere });
  });

  const remaining = {
    brands: await prisma.brand.count(),
    mediaAssets: await prisma.mediaAsset.count(),
    sourceAds: await prisma.sourceAd.count(),
    creativeBriefs: await prisma.creativeBrief.count(),
    experiments: await prisma.experiment.count(),
    performanceRows: await prisma.performanceDaily.count(),
  };
  console.log('삭제 후 주요 테이블');
  console.table(remaining);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
