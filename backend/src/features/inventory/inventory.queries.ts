import { Prisma } from '@prisma/client';
import { SqlClient } from '../../core/database/sql-client';

/**
 * Marque des comptages comme poussés vers Logistic. SQL brut : `update()` Prisma bumperait
 * `updatedAt` (@updatedAt) et la ligne repasserait aussitôt « modifiée depuis le push ».
 * `ids` non vide.
 */
export function markInventoryCountsPushed(db: SqlClient, tenantId: string, ids: string[]): Promise<number> {
  return db.$executeRaw`
    UPDATE "InventoryCount" SET "logisticPushedAt" = NOW()
    WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(ids)})
  `;
}
