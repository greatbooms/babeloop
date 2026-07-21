CREATE TYPE "MediaAssetOrigin" AS ENUM ('MANUAL', 'AD_IMPORT');
CREATE TYPE "BriefReferenceMethod" AS ENUM ('MANUAL', 'SIMILARITY', 'UNKNOWN');

ALTER TABLE "media_assets" ADD COLUMN "origin" "MediaAssetOrigin" NOT NULL DEFAULT 'MANUAL';

CREATE TABLE "media_insights" (
  "id" TEXT NOT NULL, "mediaAssetId" TEXT NOT NULL, "summary" TEXT NOT NULL,
  "hookType" TEXT NOT NULL, "targetAudience" TEXT[], "emotionalTriggers" TEXT[],
  "genres" TEXT[], "raw" JSONB NOT NULL, "provider" TEXT NOT NULL, "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_insights_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "media_asset_embeddings" (
  "id" TEXT NOT NULL, "mediaAssetId" TEXT NOT NULL, "model" TEXT NOT NULL,
  "dimension" INTEGER NOT NULL, "embedding" vector(1536) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_asset_embeddings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "brief_references" (
  "id" TEXT NOT NULL, "briefId" TEXT NOT NULL, "sourceAdId" TEXT, "titleSnapshot" TEXT,
  "method" "BriefReferenceMethod" NOT NULL, "similarity" DOUBLE PRECISION, "rank" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brief_references_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "media_assets_origin_idx" ON "media_assets"("origin");
CREATE INDEX "media_insights_mediaAssetId_idx" ON "media_insights"("mediaAssetId");
CREATE UNIQUE INDEX "media_asset_embeddings_mediaAssetId_model_key" ON "media_asset_embeddings"("mediaAssetId", "model");
CREATE UNIQUE INDEX "brief_references_briefId_rank_key" ON "brief_references"("briefId", "rank");
CREATE INDEX "brief_references_sourceAdId_idx" ON "brief_references"("sourceAdId");

ALTER TABLE "media_insights" ADD CONSTRAINT "media_insights_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_asset_embeddings" ADD CONSTRAINT "media_asset_embeddings_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brief_references" ADD CONSTRAINT "brief_references_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "creative_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brief_references" ADD CONSTRAINT "brief_references_sourceAdId_fkey" FOREIGN KEY ("sourceAdId") REFERENCES "source_ads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "media_assets" SET "origin" = 'AD_IMPORT' WHERE "id" IN (SELECT DISTINCT "mediaAssetId" FROM "source_ads" WHERE "mediaAssetId" IS NOT NULL);
INSERT INTO "brief_references" ("id", "briefId", "sourceAdId", "titleSnapshot", "method", "rank")
-- 이미 삭제된 광고 id는 FK 위반을 피하려 sourceAdId를 NULL로 백필한다 (제목 스냅샷도 없음 → UI에서 "기록 없음·삭제됨" 처리)
SELECT gen_random_uuid()::text, b."id", sa."id", sa."title", 'UNKNOWN', ids.ord - 1
FROM "creative_briefs" b CROSS JOIN LATERAL unnest(b."sourceAdIds") WITH ORDINALITY AS ids(val, ord)
LEFT JOIN "source_ads" sa ON sa."id" = ids.val;
