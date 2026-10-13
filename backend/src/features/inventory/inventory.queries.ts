import { SqlClient } from '../../core/database/sql-client';

/**
 * Marque des comptages comme poussés vers Logistic. SQL brut : `update()` Prisma bumperait
 * `updatedAt` (@updatedAt) et la ligne repasserait aussitôt « modifiée depuis le push ».
 *
 * Seule la VERSION envoyée est marquée : `version` est le `updatedAt` lu AVANT les quantités
 * poussées. Une ligne modifiée pendant l'envoi (correction saisie dans la seconde, Nantes-Reims
 * 10/10) garde un `updatedAt` différent : elle n'est pas marquée et repart au tick suivant.
 * `logisticPushedAt` reçoit cette version (même horloge que `updatedAt`, comparé par
 * isPendingLogisticPush). `rows` non vide.
 */
export function markInventoryCountsPushed(
  db: SqlClient,
  tenantId: string,
  rows: Array<{ id: string; version: Date }>,
): Promise<number> {
  const ids = rows.map((r) => r.id);
  const versions = rows.map((r) => r.version.toISOString());
  return db.$executeRaw`
    UPDATE "InventoryCount" AS ic
    SET "logisticPushedAt" = ic."updatedAt" AT TIME ZONE 'UTC'
    FROM unnest(${ids}::text[], ${versions}::timestamptz[]) AS v(id, version)
    WHERE ic."tenantId" = ${tenantId} AND ic."id" = v.id AND ic."updatedAt" = v.version
  `;
}
