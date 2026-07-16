-- CreateEnum
CREATE TYPE "ReferenceCategory" AS ENUM ('DIRECT_COMPETITOR', 'LOCAL_MARKET_REFERENCE', 'CREATIVE_REFERENCE', 'FEATURE_REFERENCE', 'ONBOARDING_REFERENCE', 'MONETIZATION_REFERENCE', 'CREATOR_ECOSYSTEM_REFERENCE');

-- CreateEnum
CREATE TYPE "SourceAdOrigin" AS ENUM ('MANUAL_URL', 'MANUAL_FILE', 'SENSOR_TOWER_CSV');

-- CreateEnum
CREATE TYPE "SourceAdStatus" AS ENUM ('REGISTERED', 'ANALYZING', 'ANALYZED', 'FAILED');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ReferenceCategory" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_ads" (
    "id" TEXT NOT NULL,
    "origin" "SourceAdOrigin" NOT NULL,
    "status" "SourceAdStatus" NOT NULL DEFAULT 'REGISTERED',
    "competitorId" TEXT,
    "title" TEXT,
    "adText" TEXT,
    "sourceUrl" TEXT,
    "externalId" TEXT,
    "networks" TEXT[],
    "countries" TEXT[],
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "impressionShare" DOUBLE PRECISION,
    "mediaAssetId" TEXT,
    "provider" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_analyses" (
    "id" TEXT NOT NULL,
    "sourceAdId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "hookText" TEXT,
    "hookType" TEXT NOT NULL,
    "ctaText" TEXT,
    "ctaType" TEXT,
    "targetAudience" TEXT[],
    "emotionalTriggers" TEXT[],
    "genres" TEXT[],
    "language" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_embeddings" (
    "id" TEXT NOT NULL,
    "sourceAdId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "competitors_name_key" ON "competitors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "source_ads_externalId_key" ON "source_ads"("externalId");

-- CreateIndex
CREATE INDEX "source_ads_status_idx" ON "source_ads"("status");

-- CreateIndex
CREATE INDEX "source_ads_competitorId_idx" ON "source_ads"("competitorId");

-- CreateIndex
CREATE INDEX "creative_analyses_sourceAdId_idx" ON "creative_analyses"("sourceAdId");

-- CreateIndex
CREATE UNIQUE INDEX "creative_embeddings_sourceAdId_model_key" ON "creative_embeddings"("sourceAdId", "model");

-- AddForeignKey
ALTER TABLE "source_ads" ADD CONSTRAINT "source_ads_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_ads" ADD CONSTRAINT "source_ads_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_analyses" ADD CONSTRAINT "creative_analyses_sourceAdId_fkey" FOREIGN KEY ("sourceAdId") REFERENCES "source_ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_embeddings" ADD CONSTRAINT "creative_embeddings_sourceAdId_fkey" FOREIGN KEY ("sourceAdId") REFERENCES "source_ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
