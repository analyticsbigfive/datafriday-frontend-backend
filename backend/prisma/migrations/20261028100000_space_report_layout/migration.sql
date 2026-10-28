-- Mise en page composable des rapports par espace (page 2 du rapport J+1).
CREATE TABLE "SpaceReportLayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceReportLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpaceReportLayout_spaceId_kind_key" ON "SpaceReportLayout"("spaceId", "kind");

CREATE INDEX "SpaceReportLayout_tenantId_idx" ON "SpaceReportLayout"("tenantId");

ALTER TABLE "SpaceReportLayout" ADD CONSTRAINT "SpaceReportLayout_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
