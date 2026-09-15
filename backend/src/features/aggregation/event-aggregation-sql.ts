import { Prisma } from '@prisma/client';

/**
 * Résolution de fenêtre d'un event (BUG-329-02/330-02, BUG-368-02, BUG-146-01, docs/bugs/).
 * `integration-range` est le mode prioritaire (Event.integrationId posé) ; `container-range`
 * (lien vers un conteneur de saison) et `range` sont les modes legacy.
 */
export type EventWindow =
  | { mode: 'exact'; salesEventId: string }
  | { mode: 'integration-range'; integrationId: string; start: Date; end: Date }
  | { mode: 'container-range'; salesEventId: string; start: Date; end: Date }
  | { mode: 'range'; start: Date; end: Date };

/**
 * BUG-352-01 : montant réellement payé par ligne (rawData->'payments', vide sur une ligne
 * formule), repli unitPrice net de remise puis détaxé quand la clé "payments" est absente.
 */
export const revenueHtExpr = Prisma.sql`
  CASE WHEN t."provider" = 'WEEZEVENT' AND ti."rawData" ? 'payments' THEN
    COALESCE((
      SELECT SUM((p->>'amount')::numeric - (p->>'amount_vat')::numeric)
      FROM jsonb_array_elements(ti."rawData"->'payments') AS p
    ), 0) / 100
  ELSE
    (ti."unitPrice" * ti."quantity" - COALESCE(ti."reduction", 0)) / (1 + ti."vat" / 100)
  END
`;

/** Clause de rattachement transaction → event selon le mode de fenêtre. */
export function buildMatchClause(window: EventWindow, seasonContainerIds: ReadonlySet<string>): Prisma.Sql {
  const eventLinkClause = seasonContainerIds.size
    ? Prisma.sql`(t."eventId" IS NULL OR t."eventId" IN (${Prisma.join([...seasonContainerIds])}))`
    : Prisma.sql`t."eventId" IS NULL`;
  switch (window.mode) {
    case 'exact':
      return Prisma.sql`t."eventId" = ${window.salesEventId}`;
    case 'integration-range':
      return Prisma.sql`t."integrationId" = ${window.integrationId} AND t."transactionDate" >= ${window.start} AND t."transactionDate" < ${window.end}`;
    case 'container-range':
      return Prisma.sql`t."eventId" = ${window.salesEventId} AND t."transactionDate" >= ${window.start} AND t."transactionDate" < ${window.end}`;
    default:
      return Prisma.sql`${eventLinkClause} AND t."transactionDate" >= ${window.start} AND t."transactionDate" < ${window.end}`;
  }
}

/**
 * BUG-370-02 : l'intégration du JOB ne filtre qu'en dehors du mode `integration-range`, où la
 * fenêtre porte déjà la seule intégration qui compte.
 * BUG-384-02 : sans intégration de job, on ne retombe plus sur le tenant entier mais sur les
 * intégrations MAPPÉES À L'ESPACE (`SpaceIntegrationScopeService`) : en mode `range`, la clause
 * de rattachement (`eventId NULL OU conteneur de saison` + fenêtre jour) est tenant-wide et
 * ramenait les ventes des autres clubs du même jour dans l'espace (Le Mans-Brest 22/08 :
 * 66 k€ Weez + 46 k€ FC Nantes Digifood → rollup 112 k€).
 */
export function buildIntegrationClause(
  jobIntegrationId: string | undefined,
  window: EventWindow,
  spaceIntegrationIds: ReadonlyArray<string> = [],
): Prisma.Sql {
  if (window.mode === 'integration-range') return Prisma.sql``;
  if (jobIntegrationId) return Prisma.sql`AND t."integrationId" = ${jobIntegrationId}`;
  return spaceIntegrationIds.length
    ? Prisma.sql`AND t."integrationId" = ANY(${[...spaceIntegrationIds]})`
    : Prisma.sql``;
}

/**
 * BUG-384-02 : le mode `range` (Event sans lien SalesEvent ni Event.integrationId) n'est
 * rattaché à rien d'autre qu'une fenêtre de dates. Sans intégration de job ET sans intégration
 * mappée à l'espace, il agrégerait le tenant entier : on refuse plutôt que d'écrire du faux.
 * Les modes `exact`/`container-range` sont épinglés à un SalesEvent, `integration-range` à
 * son intégration : ils restent traitables sans mapping (espaces historiques).
 */
export function isUnscopedRangeWindow(
  jobIntegrationId: string | undefined,
  window: EventWindow,
  spaceIntegrationIds: ReadonlyArray<string>,
): boolean {
  return window.mode === 'range' && !jobIntegrationId && spaceIntegrationIds.length === 0;
}

/** Restreint l'agrégation aux minutes données (jobs live incrémentaux) ; vide = toute la fenêtre. */
export function buildMinuteClause(minutes: ReadonlyArray<Date>): Prisma.Sql {
  return minutes.length
    ? Prisma.sql`AND date_trunc('minute', t."transactionDate") IN (${Prisma.join([...minutes])})`
    : Prisma.sql``;
}

export interface EventAggregationSqlInput {
  tenantId: string;
  spaceId: string;
  eventId: string;
  integrationClause: Prisma.Sql;
  matchClause: Prisma.Sql;
  minuteClause?: Prisma.Sql;
}

/** SpaceRevenueMinuteAgg : grain minute × location × merchant × shop (BUG-014, BUG-015, BUG-135-01). */
export function insertMinuteAggSql(i: EventAggregationSqlInput): Prisma.Sql {
  const minuteClause = i.minuteClause ?? Prisma.sql``;
  return Prisma.sql`
    INSERT INTO "SpaceRevenueMinuteAgg"
      ("id","tenantId","spaceId","minute","timezone","weezeventEventId","weezeventLocationId","weezeventMerchantId","spaceElementId","integrationId","revenueHt","transactionsCount","itemsCount","createdAt","updatedAt")
    SELECT
      gen_random_uuid(),
      ${i.tenantId},
      ${i.spaceId},
      date_trunc('minute', t."transactionDate"),
      'Europe/Paris',
      ${i.eventId},
      t."locationId",
      t."merchantId",
      lsm."spaceElementId",
      MAX(t."integrationId"),
      SUM(${revenueHtExpr}),
      COUNT(DISTINCT t."id")::int,
      SUM(ti."quantity")::float8,
      NOW(),
      NOW()
    FROM "WeezeventTransaction" t
    JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
    LEFT JOIN "WeezeventLocationShopMapping" lsm
      ON lsm."weezeventLocationId" = t."locationId" AND lsm."tenantId" = ${i.tenantId}
    WHERE t."tenantId" = ${i.tenantId}
      ${i.integrationClause}
      AND ${i.matchClause}
      ${minuteClause}
      AND t."deletedAt" IS NULL
    GROUP BY
      date_trunc('minute', t."transactionDate"),
      t."locationId",
      t."merchantId",
      lsm."spaceElementId"
    ON CONFLICT ("tenantId","spaceId","minute","weezeventEventId","weezeventLocationId","weezeventMerchantId","spaceElementId")
    DO UPDATE SET
      "integrationId" = EXCLUDED."integrationId",
      "revenueHt" = EXCLUDED."revenueHt",
      "transactionsCount" = EXCLUDED."transactionsCount",
      "itemsCount" = EXCLUDED."itemsCount",
      "updatedAt" = NOW()
  `;
}

/** SpaceRevenueMinuteItemAgg : grain minute × shop × article, transactions validées uniquement. */
export function insertMinuteItemAggSql(i: EventAggregationSqlInput): Prisma.Sql {
  const minuteClause = i.minuteClause ?? Prisma.sql``;
  return Prisma.sql`
    INSERT INTO "SpaceRevenueMinuteItemAgg"
      ("id","tenantId","spaceId","minute","timezone","weezeventEventId","weezeventLocationId","weezeventLocationName","weezeventMerchantId","spaceElementId","weezeventProductId","integrationId","revenueHt","transactionsCount","itemsCount","createdAt","updatedAt")
    SELECT
      gen_random_uuid(),
      ${i.tenantId},
      ${i.spaceId},
      date_trunc('minute', t."transactionDate"),
      'Europe/Paris',
      ${i.eventId},
      t."locationId",
      t."locationName",
      t."merchantId",
      lsm."spaceElementId",
      ti."productId",
      MAX(t."integrationId"),
      SUM(${revenueHtExpr}),
      COUNT(DISTINCT t."id")::int,
      SUM(ti."quantity")::float8,
      NOW(),
      NOW()
    FROM "WeezeventTransaction" t
    JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
    LEFT JOIN "WeezeventLocationShopMapping" lsm
      ON lsm."weezeventLocationId" = t."locationId" AND lsm."tenantId" = ${i.tenantId}
    WHERE t."tenantId" = ${i.tenantId}
      ${i.integrationClause}
      AND ${i.matchClause}
      ${minuteClause}
      AND t."deletedAt" IS NULL
      AND t."status" = 'V'
    GROUP BY
      date_trunc('minute', t."transactionDate"),
      t."locationId",
      t."locationName",
      t."merchantId",
      lsm."spaceElementId",
      ti."productId"
    ON CONFLICT ("tenantId","spaceId","minute","weezeventEventId","weezeventLocationId","weezeventMerchantId","spaceElementId","weezeventProductId")
    DO UPDATE SET
      "weezeventLocationName" = EXCLUDED."weezeventLocationName",
      "integrationId" = EXCLUDED."integrationId",
      "revenueHt" = EXCLUDED."revenueHt",
      "transactionsCount" = EXCLUDED."transactionsCount",
      "itemsCount" = EXCLUDED."itemsCount",
      "updatedAt" = NOW()
  `;
}

/** SpaceProductRevenueDailyAgg : grain jour × produit, toujours recalculée sur la journée entière. */
export function insertDailyProductAggSql(i: Omit<EventAggregationSqlInput, 'minuteClause'> & { eventDate: Date }): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "SpaceProductRevenueDailyAgg"
      ("id","tenantId","spaceId","day","weezeventProductId","integrationId","revenueHt","quantity","createdAt","updatedAt")
    SELECT
      gen_random_uuid(),
      ${i.tenantId},
      ${i.spaceId},
      ${i.eventDate}::date,
      ti."productId",
      MAX(t."integrationId"),
      SUM(${revenueHtExpr}),
      SUM(ti."quantity")::float8,
      NOW(),
      NOW()
    FROM "WeezeventTransaction" t
    JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
    WHERE t."tenantId" = ${i.tenantId}
      ${i.integrationClause}
      AND ${i.matchClause}
      AND t."deletedAt" IS NULL
      AND ti."productId" IS NOT NULL
    GROUP BY ti."productId"
    ON CONFLICT ("tenantId","spaceId","day","weezeventProductId")
    DO UPDATE SET
      "integrationId" = EXCLUDED."integrationId",
      "revenueHt" = EXCLUDED."revenueHt",
      "quantity" = EXCLUDED."quantity",
      "updatedAt" = NOW()
  `;
}
