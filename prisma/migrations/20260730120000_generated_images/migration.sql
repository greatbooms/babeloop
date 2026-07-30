-- CreateTable
CREATE TABLE "generated_images" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "costEstimateUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_images_briefId_idx" ON "generated_images"("briefId");

-- AddForeignKey
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "creative_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
