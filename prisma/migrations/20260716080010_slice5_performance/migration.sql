-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('META', 'TIKTOK', 'OTHER');

-- CreateTable
CREATE TABLE "performance_imports" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "importedRows" INTEGER NOT NULL,
    "updatedRows" INTEGER NOT NULL,
    "errorRows" INTEGER NOT NULL,
    "errors" JSONB NOT NULL,
    "unmatchedTrackingCodes" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_daily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "experimentVariantId" TEXT,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "installs" INTEGER,
    "signups" INTEGER,
    "firstMessages" INTEGER,
    "cost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "provider" TEXT NOT NULL DEFAULT 'csv',
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "confidence" "Confidence" NOT NULL DEFAULT 'HIGH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "performance_imports_fileHash_idx" ON "performance_imports"("fileHash");

-- CreateIndex
CREATE INDEX "performance_daily_trackingCode_idx" ON "performance_daily"("trackingCode");

-- CreateIndex
CREATE UNIQUE INDEX "performance_daily_date_platform_trackingCode_key" ON "performance_daily"("date", "platform", "trackingCode");

-- AddForeignKey
ALTER TABLE "performance_daily" ADD CONSTRAINT "performance_daily_experimentVariantId_fkey" FOREIGN KEY ("experimentVariantId") REFERENCES "experiment_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
