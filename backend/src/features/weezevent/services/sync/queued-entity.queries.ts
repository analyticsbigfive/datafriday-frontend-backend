import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { SqlClient } from '../../../../core/database/sql-client';

/** Tables synchronisées par page depuis l'API Weezevent (commandes, prix, participants). */
export type QueuedEntityTable = 'WeezeventOrder' | 'WeezeventPrice' | 'WeezeventAttendee';

/** Colonnes écrites, avec leur conversion SQL éventuelle (json, montant). */
interface EntityColumns {
  insert: Record<string, string | null>;
  update: string[];
}

const COLUMNS: Record<QueuedEntityTable, EntityColumns> = {
  WeezeventOrder: {
    insert: {
      eventId: null, eventName: null, userId: null, userEmail: null, status: null,
      totalAmount: 'numeric', orderDate: null, paymentMethod: null, metadata: 'jsonb', rawData: 'jsonb',
    },
    update: ['status', 'totalAmount', 'rawData'],
  },
  WeezeventPrice: {
    insert: {
      eventId: null, productId: null, name: null, amount: 'numeric', currency: null,
      validFrom: null, validUntil: null, priceType: null, metadata: 'jsonb', rawData: 'jsonb',
    },
    update: ['amount', 'validFrom', 'validUntil', 'rawData'],
  },
  WeezeventAttendee: {
    insert: {
      eventId: null, eventName: null, email: null, firstName: null, lastName: null,
      ticketType: null, status: null, metadata: 'jsonb', rawData: 'jsonb',
    },
    update: ['status', 'rawData'],
  },
};

export interface QueuedEntityRow {
  weezeventId: string;
  values: Record<string, unknown>;
}

const sqlValue = (value: unknown, cast: string | null) => {
  const v = cast === 'jsonb' ? (value == null ? null : JSON.stringify(value)) : value;
  return cast ? Prisma.sql`${v}::${Prisma.raw(cast)}` : Prisma.sql`${v}`;
};

/**
 * Upsert d'une page de lignes en une requête (au lieu d'une lecture puis d'un upsert par
 * ligne). La contrainte unique porte sur (tenantId, integrationId, weezeventId), toujours
 * filtrée sur le tenant et l'intégration passés. Renvoie le nombre de lignes créées et mises
 * à jour (`xmax = 0` distingue une insertion d'une mise à jour). `updateColumns` remplace la
 * liste des colonnes mises à jour en cas de conflit (colonnes connues de la table seulement).
 */
export async function upsertQueuedEntities(
  db: SqlClient,
  table: QueuedEntityTable,
  tenantId: string,
  integrationId: string,
  rows: QueuedEntityRow[],
  syncedAt: Date = new Date(),
  updateColumns?: string[],
): Promise<{ created: number; updated: number }> {
  if (rows.length === 0) return { created: 0, updated: 0 };
  const cols = COLUMNS[table];
  const names = Object.keys(cols.insert);
  const columnList = Prisma.raw(
    ['id', 'weezeventId', 'tenantId', 'integrationId', ...names, 'syncedAt', 'createdAt', 'updatedAt'].map((c) => `"${c}"`).join(', '),
  );
  const values = Prisma.join(
    rows.map((r) => Prisma.sql`(${Prisma.join([
      Prisma.sql`${randomUUID()}`,
      Prisma.sql`${r.weezeventId}`,
      Prisma.sql`${tenantId}`,
      Prisma.sql`${integrationId}`,
      ...names.map((n) => sqlValue(r.values[n] ?? null, cols.insert[n])),
      Prisma.sql`${syncedAt}`,
      Prisma.sql`${syncedAt}`,
      Prisma.sql`${syncedAt}`,
    ])})`),
  );
  const updates = Prisma.raw(
    [...(updateColumns ?? cols.update).filter((c) => c in cols.insert), 'syncedAt', 'updatedAt']
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(', '),
  );
  const result = await db.$queryRaw<{ inserted: boolean }[]>`
    INSERT INTO "public".${Prisma.raw(`"${table}"`)} (${columnList})
    VALUES ${values}
    ON CONFLICT ("tenantId", "integrationId", "weezeventId") DO UPDATE SET ${updates}
    RETURNING (xmax = 0) AS "inserted"
  `;
  const created = result.filter((r) => r.inserted).length;
  return { created, updated: result.length - created };
}
