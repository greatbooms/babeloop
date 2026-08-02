-- AlterTable
ALTER TABLE "generated_images" ADD COLUMN "creativeId" TEXT;

-- CreateTable
CREATE TABLE "generated_videos" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'video/mp4',
    "seconds" INTEGER NOT NULL,
    "size" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "instructions" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "costEstimateUsd" DECIMAL(10,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_images_creativeId_idx" ON "generated_images"("creativeId");

-- CreateIndex
CREATE INDEX "generated_videos_creativeId_idx" ON "generated_videos"("creativeId");

-- AddForeignKey
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "generated_creatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_videos" ADD CONSTRAINT "generated_videos_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "generated_creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
