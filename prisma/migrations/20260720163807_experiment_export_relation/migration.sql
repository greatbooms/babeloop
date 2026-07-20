-- AddForeignKey
ALTER TABLE "export_packages" ADD CONSTRAINT "export_packages_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
