import { SqlClient } from '../../core/database/sql-client';

/** Horloge de la base (référence du balayage des lignes d'agrégats non réécrites). */
export function selectDatabaseNow(db: SqlClient): Promise<Array<{ now: Date }>> {
  return db.$queryRaw<Array<{ now: Date }>>`SELECT NOW() AS "now"`;
}
