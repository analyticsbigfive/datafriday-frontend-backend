import { SqlClient } from '../database/sql-client';

/**
 * Verrou consultatif de transaction : sérialise la synchro du catalogue de permissions
 * entre process qui démarrent en même temps (API et worker). Catalogue système, sans tenant.
 */
export function lockRbacCatalogSync(tx: SqlClient): Promise<number> {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rbac-catalog-sync'))`;
}
