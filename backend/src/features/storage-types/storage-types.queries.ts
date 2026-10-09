import { SqlClient } from '../../core/database/sql-client';

/**
 * Renomme un type de stockage dans le tableau MenuItem.storageType (pas d'array-replace
 * natif en Prisma). Renvoie une PrismaPromise : utilisable dans `$transaction([...])`.
 */
export function renameStorageTypeInMenuItems(db: SqlClient, tenantId: string, oldName: string, newName: string) {
  return db.$executeRaw`UPDATE "MenuItem" SET "storageType" = array_replace("storageType", ${oldName}, ${newName}) WHERE "tenantId" = ${tenantId} AND ${oldName} = ANY("storageType")`;
}
