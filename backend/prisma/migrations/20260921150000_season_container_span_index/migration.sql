-- Span observé par event (EventWindowResolverService.resolveSeasonContainerEventIds) : la requête
-- GROUP BY eventId, MIN/MAX(transactionDate) WHERE deletedAt IS NULL faisait un seq scan de la
-- table (4,6 GB, 22 s de moyenne, 1er consommateur disque de la base le 2026-09-21). Toutes les
-- colonnes lues sont dans la clé : index-only scan.
CREATE INDEX "WeezeventTransaction_tenant_event_txdate_deleted_idx"
  ON "WeezeventTransaction"("tenantId", "eventId", "transactionDate", "deletedAt");
