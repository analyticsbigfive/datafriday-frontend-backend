-- Déploiement du script manuel prisma/sql/2026-07-29_hr_staffing_module.sql
-- (jamais appliqué jusqu'ici, cf. ADR-0002 : prisma/migrations/ est gitignoré,
-- donc `prisma migrate deploy` du startCommand Render était un no-op silencieux).
-- Contenu identique au script source, copié tel quel pour entrer dans l'historique
-- _prisma_migrations. Idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "HrSupplier" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "contact"   TEXT,
    "email"     TEXT,
    "tel"       TEXT,
    "picture"   TEXT,
    "sectors"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "spaceIds"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrSupplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HrSupplier_tenantId_name_key" ON "HrSupplier"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "HrSupplier_tenantId_idx" ON "HrSupplier"("tenantId");

CREATE TABLE IF NOT EXISTS "HrRole" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "department"    TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "contractType"  TEXT,
    "rateType"      TEXT,
    "rate"          DOUBLE PRECISION,
    "fnbCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "algoKey"       TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HrRole_tenantId_name_key" ON "HrRole"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "HrRole_tenantId_idx" ON "HrRole"("tenantId");

CREATE TABLE IF NOT EXISTS "HrRoleSupplier" (
    "roleId"     TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    CONSTRAINT "HrRoleSupplier_pkey" PRIMARY KEY ("roleId", "supplierId"),
    CONSTRAINT "HrRoleSupplier_roleId_fkey" FOREIGN KEY ("roleId")
        REFERENCES "HrRole"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HrRoleSupplier_supplierId_fkey" FOREIGN KEY ("supplierId")
        REFERENCES "HrSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "HrRoleSupplier_roleId_idx" ON "HrRoleSupplier"("roleId");
CREATE INDEX IF NOT EXISTS "HrRoleSupplier_supplierId_idx" ON "HrRoleSupplier"("supplierId");

CREATE TABLE IF NOT EXISTS "HrPerson" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "roleId"       TEXT NOT NULL,
    "firstName"    TEXT NOT NULL,
    "lastName"     TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "hourlyRate"   DOUBLE PRECISION,
    "active"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrPerson_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HrPerson_roleId_fkey" FOREIGN KEY ("roleId")
        REFERENCES "HrRole"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "HrPerson_tenantId_roleId_idx" ON "HrPerson"("tenantId", "roleId");

CREATE TABLE IF NOT EXISTS "HrRoleSpaceDefault" (
    "id"         TEXT NOT NULL,
    "spaceId"    TEXT NOT NULL,
    "roleId"     TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    CONSTRAINT "HrRoleSpaceDefault_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HrRoleSpaceDefault_spaceId_fkey" FOREIGN KEY ("spaceId")
        REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HrRoleSpaceDefault_roleId_fkey" FOREIGN KEY ("roleId")
        REFERENCES "HrRole"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HrRoleSpaceDefault_supplierId_fkey" FOREIGN KEY ("supplierId")
        REFERENCES "HrSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "HrRoleSpaceDefault_spaceId_roleId_key" ON "HrRoleSpaceDefault"("spaceId", "roleId");
CREATE INDEX IF NOT EXISTS "HrRoleSpaceDefault_roleId_idx" ON "HrRoleSpaceDefault"("roleId");
CREATE INDEX IF NOT EXISTS "HrRoleSpaceDefault_supplierId_idx" ON "HrRoleSpaceDefault"("supplierId");

CREATE TABLE IF NOT EXISTS "EventStaffLine" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "eventId"      TEXT NOT NULL,
    "elementId"    TEXT NOT NULL,
    "roleId"       TEXT,
    "algoKey"      TEXT,
    "enabled"      BOOLEAN NOT NULL DEFAULT true,
    "source"       TEXT NOT NULL,
    "userModified" BOOLEAN NOT NULL DEFAULT false,
    "supplierType" TEXT,
    "supplierId"   TEXT,
    "personId"     TEXT,
    "personLabel"  TEXT,
    "hourlyRate"   DOUBLE PRECISION NOT NULL,
    "startTime"    TIMESTAMP(3) NOT NULL,
    "endTime"      TIMESTAMP(3) NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventStaffLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventStaffLine_eventId_fkey" FOREIGN KEY ("eventId")
        REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventStaffLine_elementId_fkey" FOREIGN KEY ("elementId")
        REFERENCES "SpaceElement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventStaffLine_roleId_fkey" FOREIGN KEY ("roleId")
        REFERENCES "HrRole"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EventStaffLine_supplierId_fkey" FOREIGN KEY ("supplierId")
        REFERENCES "HrSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EventStaffLine_personId_fkey" FOREIGN KEY ("personId")
        REFERENCES "HrPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "EventStaffLine_eventId_elementId_idx" ON "EventStaffLine"("eventId", "elementId");
CREATE INDEX IF NOT EXISTS "EventStaffLine_tenantId_idx" ON "EventStaffLine"("tenantId");
CREATE INDEX IF NOT EXISTS "EventStaffLine_roleId_idx" ON "EventStaffLine"("roleId");
CREATE INDEX IF NOT EXISTS "EventStaffLine_elementId_idx" ON "EventStaffLine"("elementId");
