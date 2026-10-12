-- Used parts mirrored from Reklama5 and Pazar3.
ALTER TABLE "SiteSettings" ADD COLUMN "classifiedSyncedAt" TIMESTAMP(3);

CREATE TABLE "ClassifiedListing" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceMkd" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "city" TEXT NOT NULL DEFAULT '',
    "postedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassifiedListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassifiedListing_source_externalId_key" ON "ClassifiedListing"("source", "externalId");
CREATE INDEX "ClassifiedListing_status_postedAt_idx" ON "ClassifiedListing"("status", "postedAt");
CREATE INDEX "ClassifiedListing_status_category_idx" ON "ClassifiedListing"("status", "category");
