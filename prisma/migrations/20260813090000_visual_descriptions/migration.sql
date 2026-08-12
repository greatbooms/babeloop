-- CreateTable
CREATE TABLE "visual_descriptions" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visual_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visual_descriptions_mediaAssetId_idx" ON "visual_descriptions"("mediaAssetId");

-- AddForeignKey
ALTER TABLE "visual_descriptions" ADD CONSTRAINT "visual_descriptions_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
