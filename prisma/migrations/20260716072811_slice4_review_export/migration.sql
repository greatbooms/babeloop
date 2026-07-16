-- CreateEnum
CREATE TYPE "PolicyCheckType" AS ENUM ('BANNED_TERM', 'SIMILARITY', 'MINOR_SIGNAL');

-- CreateEnum
CREATE TYPE "PolicyCheckStatus" AS ENUM ('PASS', 'WARN', 'FLAGGED');

-- CreateEnum
CREATE TYPE "ReviewEventKind" AS ENUM ('POLICY_CHECKED', 'REVIEW_REQUESTED', 'LOCALIZATION_REVISED', 'LOCALIZATION_APPROVED', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED', 'MINOR_FLAG_RELEASED', 'EXPORTED');

-- AlterTable
ALTER TABLE "generated_creatives" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "lastEditedById" TEXT,
ADD COLUMN     "minorFlagNote" TEXT,
ADD COLUMN     "minorFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "policy_checks" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "checkType" "PolicyCheckType" NOT NULL,
    "status" "PolicyCheckStatus" NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_requests" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "kind" "ReviewEventKind" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL DEFAULT 'TW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_variants" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "variantCode" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_packages" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "storagePrefix" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policy_checks_creativeId_idx" ON "policy_checks"("creativeId");

-- CreateIndex
CREATE INDEX "review_requests_creativeId_idx" ON "review_requests"("creativeId");

-- CreateIndex
CREATE UNIQUE INDEX "experiments_code_key" ON "experiments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_variants_trackingCode_key" ON "experiment_variants"("trackingCode");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_variants_experimentId_creativeId_key" ON "experiment_variants"("experimentId", "creativeId");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_variants_experimentId_variantCode_key" ON "experiment_variants"("experimentId", "variantCode");

-- AddForeignKey
ALTER TABLE "policy_checks" ADD CONSTRAINT "policy_checks_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "generated_creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "generated_creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "generated_creatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
