ALTER TABLE "experiment_variants" ADD COLUMN "exportedAt" TIMESTAMP(3);

UPDATE "experiment_variants" ev
SET "exportedAt" = p.first_export
FROM (
  SELECT "experimentId", MIN("createdAt") AS first_export
  FROM "export_packages"
  GROUP BY "experimentId"
) p
WHERE p."experimentId" = ev."experimentId"
  AND ev."creativeId" IN (
    SELECT id
    FROM "generated_creatives"
    WHERE status = 'EXPORTED'
  );

UPDATE "generated_creatives"
SET status = 'APPROVED'
WHERE status = 'EXPORTED';

CREATE TYPE "CreativeStatus_new" AS ENUM (
  'DRAFT',
  'POLICY_CHECKED',
  'IN_REVIEW',
  'LOCALIZATION_APPROVED',
  'APPROVED',
  'REVISION_REQUESTED',
  'REJECTED'
);

ALTER TABLE "generated_creatives" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "generated_creatives" ALTER COLUMN "status" TYPE "CreativeStatus_new" USING ("status"::text::"CreativeStatus_new");
ALTER TABLE "generated_creatives" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "CreativeStatus";
ALTER TYPE "CreativeStatus_new" RENAME TO "CreativeStatus";
