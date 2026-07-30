-- AlterTable
ALTER TABLE "brands" ADD COLUMN     "koFields" JSONB;

-- AlterTable
ALTER TABLE "localization_versions" ADD COLUMN     "koBackTranslation" TEXT;
