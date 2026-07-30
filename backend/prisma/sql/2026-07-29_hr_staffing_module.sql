-- Module RH staffing — tables HrSupplier / HrRole / HrRoleSupplier / HrPerson /
-- HrRoleSpaceDefault / EventStaffLine (2026-07-29, branche feat/Hr)
--
-- Pourquoi : le module RH (écrans Suppliers / Roles + algorithme de staffing
-- par événement × PDV) sort les données du localStorage (frontend
-- utils/hrApi.js, clés hr_suppliers / staff_positions) vers la BD, et ajoute
-- les lignes de staff générées par l'algo « Règles RH » (paliers n = FLOOR(CA
-- / goalTpe), validés JLH 2026-07-29) avec ajustements utilisateur.
--
-- Sémantique :
--   HrSupplier          = agence d'intérim / prestataire staff (par tenant)
--   HrRole              = rôle métier RH (« position ») — SANS rapport avec
--                         "Role" (permissions utilisateurs)
--   HrRoleSupplier      = jointure rôle ↔ agences (multi-select si AGENCY)
--   HrPerson            = personne interne CDI/CDD rattachée à un rôle
--   HrRoleSpaceDefault  = agence par défaut d'un espace pour un rôle
--   EventStaffLine      = une PERSONNE planifiée sur un PDV pour un événement
--                         (source ALGO ou MANUAL ; userModified = jamais
--                         écrasée par une régénération). Le coût prédit figé
--                         vit dans ElementPerformance.staffCost.
--
-- Application MANUELLE uniquement (ADR-0002 : jamais via la plateforme).
-- Idempotent (IF NOT EXISTS) — exécutable plusieurs fois sans effet.

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
