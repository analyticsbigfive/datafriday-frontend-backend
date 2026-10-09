import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { eventTimelineWindowCtes } from '../event-timeline-window.sql';
import { queryWithWorkMem } from '../../../core/database/query-with-work-mem';
import { SpaceCacheService } from './space-cache.service';
import { SpaceSalesScopeService } from './space-sales-scope.service';

/**
 * Timeline des ventes par minute d'un ou plusieurs events d'un espace.
 */
@Injectable()
export class SpaceEventTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly spaceCacheService: SpaceCacheService,
    private readonly spaceSalesScopeService: SpaceSalesScopeService,
  ) {}

  /**
   * Get minute-level timeline for one event: minute × shop × menuItem
   * Returns one record per (minute, spaceElementId, weezeventProductId) combination.
   * Thin wrapper around getEventTimelineBatch for callers that still request one event
   * at a time (e.g. EventPredictView) — new call sites should use the batch method.
   */
  async getEventTimeline(spaceId: string, eventId: string, tenantId: string) {
    const batch = await this.getEventTimelineBatch(spaceId, [eventId], tenantId);
    return batch[eventId] ?? [];
  }

  async getEventTimelineBatch(
    spaceId: string,
    eventIds: string[],
    tenantId: string,
    // BUG-364-01 (étape 5 du plan 25/08) : granularity 'summary' = grain event × shop ×
    // produit SANS la dimension minute — le chargement de montage de l'Analyse n'a
    // besoin que de totaux (vérifié consommateur par consommateur, fiche 364-01), le
    // grain minute (~2 Mo/event) ne sert qu'à la courbe horaire, qui garde son fetch
    // séparé plein grain. Facteur ~100-200× sur la taille de réponse.
    opts: { granularity?: 'minute' | 'summary' } = {},
  ): Promise<Record<string, any[]>> {
    const summary = opts.granularity === 'summary';
    // Clé de cache distincte par granularité (':sum'), couverte par le motif de purge
    // spaces:evtimeline:{tenantId}:{spaceId}:* (suffixe APRÈS l'eventId).
    const cacheKeyOf = (id: string) =>
      this.spaceCacheService.EVENT_TIMELINE_CACHE_KEY(tenantId, spaceId, id) + (summary ? ':sum' : '');
    const uniqueIds = [...new Set(eventIds.filter(Boolean))].slice(0, 100);
    const out: Record<string, any[]> = Object.fromEntries(uniqueIds.map(id => [id, []]));
    if (!uniqueIds.length) return out;

    // BUG-143-01 : lookup Redis par event — seuls les manquants paient le SQL ci-dessous.
    const cachedEntries = await Promise.all(
      uniqueIds.map(async id => [id, await this.redis.get<any[]>(cacheKeyOf(id))] as const),
    );
    const missing: string[] = [];
    for (const [id, cached] of cachedEntries) {
      // `!= null` (et pas `!== null`) : RedisService.get renvoie null sur miss, mais un
      // double mocké/dégradé peut renvoyer undefined — les deux sont des miss. `[]` en
      // cache est un HIT valide (« aucune vente » est un résultat).
      if (cached != null) out[id] = cached;
      else missing.push(id);
    }
    if (!missing.length) return out;

    const scope = await this.spaceSalesScopeService.resolveEventSalesScope(spaceId, missing, tenantId);
    if (!scope) return out;
    const { shopScopeClause, valuesSql, spaceTimezone } = scope;

    // BUG-364-01 — granularity=summary : grain event × shop × produit, SANS minute.
    // Même CTE dedup (l'élimination des lignes jumelles inter-writers reste PAR minute,
    // cf. BUG-130-01 ci-dessous), même clause tag conteneur (BUG-146-01), mêmes fenêtres —
    // seule l'agrégation finale écrase la dimension minute. Dégraissage assumé du même
    // coup (plan étape 5.3) : pas de `minute`/`minuteLocal`, pas de doublon `revenue`
    // (les consommateurs lisent `revenueHt`, repli ajouté dans timelineBucketing.js).
    if (summary) {
      const rows: any[] = await this.spaceSalesScopeService.analyseBatchSemaphore.run(() => queryWithWorkMem<any[]>(this.prisma, Prisma.sql`
        ${eventTimelineWindowCtes({ tenantId, spaceId, valuesSql, shopScopeClause })}
        SELECT
          dd."eventId"                                                      AS "eventId",
          COALESCE(dd."spaceElementId", dd."weezeventLocationId")           AS "shopId",
          COALESCE(se.name, dd."weezeventLocationName", dd."weezeventLocationId") AS "shopName",
          COALESCE(se.attributes::jsonb->>'originalType', se.type::text)   AS "shopType",
          se.attributes::jsonb->>'area'                                     AS "shopArea",
          dd."weezeventProductId"                                           AS "weezeventProductId",
          wpm."menuItemId",
          mi.name                                                           AS "menuItemName",
          pt.name                                                           AS "menuItemType",
          pc.name                                                           AS "menuItemCategory",
          SUM(dd."itemsCount")::integer                                     AS quantity,
          SUM(dd."transactionsCount")::integer                              AS "transactionCount",
          SUM(dd."revenueHt")::numeric(12,2)                                AS "revenueHt"
        FROM dedup dd
        LEFT JOIN "SpaceElement" se
          ON se.id = dd."spaceElementId"
        LEFT JOIN "WeezeventProductMapping" wpm
          ON wpm."weezeventProductId" = dd."weezeventProductId"
         AND wpm."tenantId" = ${tenantId}
        LEFT JOIN "MenuItem" mi
          ON mi.id = wpm."menuItemId"
        LEFT JOIN "ProductType" pt
          ON pt.id = mi."typeId"
        LEFT JOIN "ProductCategory" pc
          ON pc.id = mi."categoryId"
        GROUP BY
          dd."eventId",
          COALESCE(dd."spaceElementId", dd."weezeventLocationId"),
          COALESCE(se.name, dd."weezeventLocationName", dd."weezeventLocationId"),
          se.type, se.attributes,
          dd."weezeventProductId", wpm."menuItemId", mi.name, pt.name, pc.name
        ORDER BY dd."eventId"
      `));

      for (const r of rows) {
        const bucket = out[r.eventId];
        if (!bucket) continue;
        bucket.push({
          shopId:           r.shopId,
          shopName:         r.shopName,
          shopType:         r.shopType ?? null,
          shopArea:         r.shopArea ?? null,
          weezeventProductId: r.weezeventProductId ?? null,
          menuItemId:       r.menuItemId ?? null,
          menuItemName:     r.menuItemName ?? null,
          menuItemType:     r.menuItemType ?? null,
          menuItemCategory: r.menuItemCategory ?? null,
          quantity:         Number(r.quantity         || 0),
          transactionCount: Number(r.transactionCount || 0),
          revenueHt:        Number(r.revenueHt        || 0),
        });
      }

      await Promise.all(
        missing.map(id =>
          this.redis.set(cacheKeyOf(id), out[id], {
            ttl: this.spaceSalesScopeService.eventBatchCacheTtl(scope.windows, id),
          }),
        ),
      );
      return out;
    }

    // BUG-270 : "minute" est un TIMESTAMP sans fuseau mais sa valeur littérale est du vrai
    // UTC (même nature que WeezeventTransaction."transactionDate", dont elle est dérivée par
    // date_trunc('minute', t."transactionDate") côté écriture, sans conversion — voir
    // aggregation.service.ts). Même conversion `AT TIME ZONE 'UTC' AT TIME ZONE ${tz}` qu'avant
    // pour reprojeter en heure murale locale de l'espace (BUG-125-01 : factorisée dans le
    // LATERAL `tz` pour que Postgres ne voie qu'une seule interpolation du paramètre).
    //
    // Le JOIN reste borné par fenêtre de dates (ev."windowStart"/"windowEnd"), PAS par égalité
    // sur "weezeventEventId" : les deux pipelines d'écriture (aggregation.service.ts, et
    // space-aggregation.service.ts retiré le 2026-10-09 dont les lignes restent en base)
    // taguent ce champ avec des conventions d'id différentes
    // (id "Event" DataFriday vs id "WeezeventEvent" brut — cf. BUG-123-01 dans la RPC
    // get_space_shop_details) ; une égalité stricte manquerait les events qui n'existent
    // qu'en WeezeventEvent. Depuis BUG-339-02, la fenêtre est resserrée sur l'heure de fin
    // réelle de l'event (voir resolveEventSalesScope) — deux events consécutifs ne se
    // chevauchent plus quand leurs heures de fin sont connues.
    //
    // Agrégation en DEUX niveaux (BUG-130-01, régression du commit perf
    // event-timeline-item-agg qui faisait un MAX à un seul niveau) :
    //
    // 1. CTE "dedup" — MAX(...) par (event, minute, shop, location, MERCHANT, article),
    //    en écrasant UNIQUEMENT "weezeventEventId" : si les deux pipelines d'écriture ont
    //    tous les deux écrit pour la même fenêtre, on obtient deux lignes jumelles pour le
    //    même créneau — mêmes transactions réelles, seul le tag "weezeventEventId" diffère
    //    (id Event DataFriday vs id WeezeventEvent brut). Les jumelles portent la même
    //    valeur (même source, même formule) ; SUM les compterait en double, MAX retombe
    //    sur la valeur correcte sans hypothèse fragile sur quel writer a tourné en dernier.
    //
    // 2. Niveau affichage — SUM(...) par (event, minute locale, shop, article) : deux
    //    merchants (ou deux locations non mappées) qui vendent le même article à la même
    //    minute sont des ventes LÉGITIMEMENT DISTINCTES et doivent s'additionner. C'est ce
    //    que le MAX à un seul niveau écrasait (le GROUP BY sortait aussi
    //    "weezeventMerchantId") : chaque minute était plafonnée à la plus grosse ligne au
    //    lieu du total → timeline réelle aplatie en plateau constant.
    // BUG-144-01 : section SQL sous sémaphore (2 en vol, file 32, 60 s -> 503) — les
    // hits cache plus haut ne font pas la queue.
    const rows: any[] = await this.spaceSalesScopeService.analyseBatchSemaphore.run(() => queryWithWorkMem<any[]>(this.prisma, Prisma.sql`
      ${eventTimelineWindowCtes({ tenantId, spaceId, valuesSql, shopScopeClause })}
      SELECT
        dd."eventId"                                                      AS "eventId",
        TO_CHAR(tz."minuteLocal", 'HH24:MI')                              AS minute,
        -- BUG-351-01 : la minute DATEE, en heure murale locale de l'espace.
        -- La colonne minute seule (HH24:MI) perd le jour : une vente a 00h30 qui
        -- prolonge l'evenement de la veille se retrouvait triee AVANT 19h00, en
        -- tete de courbe. minute est conservee telle quelle (tous les
        -- consommateurs actuels la lisent) ; les ecrans qui doivent ordonner ou
        -- franchir minuit lisent minuteLocal.
        TO_CHAR(tz."minuteLocal", 'YYYY-MM-DD"T"HH24:MI')                 AS "minuteLocal",
        COALESCE(dd."spaceElementId", dd."weezeventLocationId")           AS "shopId",
        COALESCE(se.name, dd."weezeventLocationName", dd."weezeventLocationId") AS "shopName",
        COALESCE(se.attributes::jsonb->>'originalType', se.type::text)   AS "shopType",
        se.attributes::jsonb->>'area'                                     AS "shopArea",
        dd."weezeventProductId"                                           AS "weezeventProductId",
        wpm."menuItemId",
        mi.name                                                           AS "menuItemName",
        pt.name                                                           AS "menuItemType",
        pc.name                                                           AS "menuItemCategory",
        SUM(dd."itemsCount")::integer                                     AS quantity,
        SUM(dd."transactionsCount")::integer                              AS "transactionCount",
        SUM(dd."revenueHt")::numeric(12,2)                                AS "revenueHt"
      FROM dedup dd
      CROSS JOIN LATERAL (
        SELECT DATE_TRUNC('minute', dd."minute" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone}) AS "minuteLocal"
      ) tz
      LEFT JOIN "SpaceElement" se
        ON se.id = dd."spaceElementId"
      LEFT JOIN "WeezeventProductMapping" wpm
        ON wpm."weezeventProductId" = dd."weezeventProductId"
       AND wpm."tenantId" = ${tenantId}
      LEFT JOIN "MenuItem" mi
        ON mi.id = wpm."menuItemId"
      LEFT JOIN "ProductType" pt
        ON pt.id = mi."typeId"
      LEFT JOIN "ProductCategory" pc
        ON pc.id = mi."categoryId"
      GROUP BY
        dd."eventId", tz."minuteLocal",
        COALESCE(dd."spaceElementId", dd."weezeventLocationId"),
        COALESCE(se.name, dd."weezeventLocationName", dd."weezeventLocationId"),
        se.type, se.attributes,
        dd."weezeventProductId", wpm."menuItemId", mi.name, pt.name, pc.name
      -- Tri sur la minute DATEE (BUG-351-01) : trier sur la colonne minute
      -- (HH24:MI) placait les ventes d'apres minuit en tete d'evenement.
      ORDER BY dd."eventId", tz."minuteLocal" ASC
    `));

    for (const r of rows) {
      const bucket = out[r.eventId];
      if (!bucket) continue;
      bucket.push({
        minute:           r.minute,
        minuteLocal:      r.minuteLocal ?? null,
        shopId:           r.shopId,
        shopName:         r.shopName,
        shopType:         r.shopType ?? null,
        shopArea:         r.shopArea ?? null,
        weezeventProductId: r.weezeventProductId ?? null,
        menuItemId:       r.menuItemId ?? null,
        menuItemName:     r.menuItemName ?? null,
        menuItemType:     r.menuItemType ?? null,
        menuItemCategory: r.menuItemCategory ?? null,
        quantity:         Number(r.quantity         || 0),
        transactionCount: Number(r.transactionCount || 0),
        revenueHt:        Number(r.revenueHt        || 0),
        revenue:          Number(r.revenueHt        || 0),
      });
    }

    // BUG-143-01 : écrit chaque event résolu (y compris []) — un event passé sans vente
    // est un résultat définitif au même titre qu'un event plein.
    await Promise.all(
      missing.map(id =>
        this.redis.set(cacheKeyOf(id), out[id], {
          ttl: this.spaceSalesScopeService.eventBatchCacheTtl(scope.windows, id),
        }),
      ),
    );
    return out;
  }
}
