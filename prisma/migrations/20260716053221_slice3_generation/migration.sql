-- CreateEnum
CREATE TYPE "CreativeType" AS ENUM ('COPY', 'VIDEO_SCRIPT');

-- CreateEnum
CREATE TYPE "CreativeStatus" AS ENUM ('DRAFT', 'POLICY_CHECKED', 'IN_REVIEW', 'LOCALIZATION_APPROVED', 'APPROVED', 'EXPORTED', 'REVISION_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LocalizationKind" AS ENUM ('AI_DRAFT', 'HUMAN_REVISED', 'APPROVED');

-- CreateTable
CREATE TABLE "creative_briefs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL DEFAULT 'TW',
    "locale" TEXT NOT NULL DEFAULT 'zh-TW',
    "audienceHypothesis" TEXT NOT NULL,
    "desire" TEXT NOT NULL,
    "hookType" TEXT NOT NULL,
    "messageAngle" TEXT NOT NULL,
    "visualFormat" TEXT NOT NULL,
    "callToAction" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "focusText" TEXT,
    "sourceAdIds" TEXT[],
    "brandId" TEXT,
    "raw" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_creatives" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "type" "CreativeType" NOT NULL,
    "status" "CreativeStatus" NOT NULL DEFAULT 'DRAFT',
    "variantIndex" INTEGER NOT NULL,
    "hookType" TEXT,
    "koreanText" TEXT NOT NULL,
    "scenes" JSONB,
    "raw" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localization_versions" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'zh-TW',
    "kind" "LocalizationKind" NOT NULL,
    "text" TEXT NOT NULL,
    "notes" TEXT,
    "reviewerId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "localization_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_creatives_briefId_idx" ON "generated_creatives"("briefId");

-- CreateIndex
CREATE INDEX "generated_creatives_status_idx" ON "generated_creatives"("status");

-- CreateIndex
CREATE INDEX "localization_versions_creativeId_idx" ON "localization_versions"("creativeId");

-- AddForeignKey
ALTER TABLE "creative_briefs" ADD CONSTRAINT "creative_briefs_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_briefs" ADD CONSTRAINT "creative_briefs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_creatives" ADD CONSTRAINT "generated_creatives_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "creative_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "localization_versions" ADD CONSTRAINT "localization_versions_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "generated_creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "localization_versions" ADD CONSTRAINT "localization_versions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
