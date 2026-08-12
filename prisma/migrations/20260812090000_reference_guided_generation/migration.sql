ALTER TABLE "generated_images" ADD COLUMN "referenceKeys" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "generated_videos" ADD COLUMN "referenceKeys" TEXT[] NOT NULL DEFAULT '{}';
