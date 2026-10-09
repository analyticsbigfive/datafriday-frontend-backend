import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { queryWithWorkMem } from '../../../core/database/query-with-work-mem';
import { readBasketAggSql } from '../basket-agg-read.sql';
import { hasPermission, PermissionCheckableUser } from '../../../core/rbac/permission.util';
import { SpaceCacheService } from './space-cache.service';
import { SpaceCrudService } from './space-crud.service';
import { SpaceSalesScopeService } from './space-sales-scope.service';

/**
 * Lectures par lot de l'écran Analyse : paniers et ventes non rattachées.
 */
@Injectable()
export class SpaceAnalyseBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly spaceCacheService: SpaceCacheService,
    private readonly spaceCrudService: SpaceCrudService,
    private readonly spaceSalesScopeService: SpaceSalesScopeService,
  ) {}

  /**
   * Répartition des COMBINAISONS de catégories/articles PAR TRANSACTION (panier).
   *
   * Alimente le donut « Répartition des catégories de produits par transaction » :
   * chaque part = l'ensemble distinct des catégories présentes dans un même panier
   * (« Bières » seule, « Bières, Boissons Soft », …), la valeur = le NOMBRE DE
   * TRANSACTIONS. C'est la seule lecture du code qui préserve l'identité du panier :
   * `getEventTimelineBatch` porte la même chaîne de jointure mais écrase `t.id` en
   * `COUNT(DISTINCT t.id)`, et aucun pré-agrégat ne porte de dimension transaction
   * (`SpaceRevenueMinuteAgg` n'a pas de produit, `SpaceProductRevenueDailyAgg` pas de
   * transaction).
   *
   * Grain de sortie : (event × minute × PdV × combo catégories × combo articles) avec
   * un `transactionCount`. PAS les combos déjà comptés globalement — le front doit
   * pouvoir appliquer ses filtres PdV/horaire côté client sans refetch, comme le reste
   * de la page. Les paniers étant très majoritairement des singletons, ce grain
   * s'effondre fortement.
   *
   * Sémantique assumée, à connaître avant de lire les chiffres :
   * - les REMBOURSEMENTS sont comptés (statut 'V' avec montants négatifs : ils sont
   *   indiscernables d'une vente par le statut, et un panier de remboursement reste un
   *   panier). Pas de filtre sur le signe — il changerait le dénominateur en silence ;
   * - les lignes non résolues (produit non mappé, ou `MenuItem.categoryId` NULL) sortent
   *   en `null` DANS le tableau, jamais écartées : le front les affiche en « Non
   *   rattachés » plutôt que de sous-compter sans le dire ;
   * - les FORMULES ne sont pas regroupées : leurs lignes filles comptent chacune pour
   *   elles-mêmes (`compoundId` est de toute façon codé à null sur le chemin de synchro
   *   incrémental, celui qui tourne en production) ;
   * - les paniers VIDES (possibles sur ce même chemin incrémental) disparaissent d'eux-
   *   mêmes via l'INNER JOIN sur les items : un panier sans ligne n'a pas de combinaison.
   */
  async getTransactionBasketsBatch(
    spaceId: string,
    eventIds: string[],
    tenantId: string,
    user?: PermissionCheckableUser,
  ): Promise<Record<string, any[]>> {
    const out = await this.getTransactionBasketsBatchRaw(spaceId, eventIds, tenantId);
    if (user && !hasPermission(user, 'stats.financial.view')) {
      const redacted: Record<string, any[]> = {};
      for (const [eventId, records] of Object.entries(out)) {
        redacted[eventId] = records.map((r) => this.spaceCrudService.stripFields(r, ['revenue', 'revenueHt']));
      }
      return redacted;
    }
    return out;
  }

  private async getTransactionBasketsBatchRaw(spaceId: string, eventIds: string[], tenantId: string): Promise<Record<string, any[]>> {
    const uniqueIds = [...new Set(eventIds.filter(Boolean))].slice(0, 100);
    const out: Record<string, any[]> = Object.fromEntries(uniqueIds.map(id => [id, []]));
    if (!uniqueIds.length) return out;

    // BUG-143-01 : même cache par event que getEventTimelineBatch (clé dédiée — forme de
    // record différente), seuls les manquants paient le scan brut WeezeventTransaction.
    const cachedEntries = await Promise.all(
      uniqueIds.map(async id => [id, await this.redis.get<any[]>(this.spaceCacheService.EVENT_BASKETS_CACHE_KEY(tenantId, spaceId, id))] as const),
    );
    const missing: string[] = [];
    for (const [id, cached] of cachedEntries) {
      // `!= null` : null (RedisService) ET undefined (double mocké/dégradé) sont des miss.
      if (cached != null) out[id] = cached;
      else missing.push(id);
    }
    if (!missing.length) return out;

    const scope = await this.spaceSalesScopeService.resolveEventSalesScope(spaceId, missing, tenantId);
    if (!scope) return out;
    const { integrationClause, shopScopeClause, spaceTimezone } = scope;
    const scopedIds = scope.windows.map(w => w.id);

    // 1. Paniers pré-agrégés (SpaceBasketMinuteAgg, écrits par les pipelines d'agrégation) :
    //    lecture par event, libellés résolus à la lecture. 2026-09-21 : la lecture brute coûtait
    //    6 s par paquet de 15 events même après index (20 à 56 s avant), 502 du proxy à 30 s.
    const pushRow = (r: any) => {
      const bucket = out[r.eventId];
      if (!bucket) return;
      bucket.push({
        minute:      r.minute,
        minuteLocal: r.minuteLocal ?? null,
        shopId:   r.shopId,
        shopName: r.shopName,
        shopType: r.shopType ?? null,
        shopArea: r.shopArea ?? null,
        // `null` conservé DANS le tableau (produit non mappé / catégorie absente) :
        // le front le rend en « Non rattachés ». Ne pas compacter ici.
        categoryCombo:    Array.isArray(r.categoryCombo) ? r.categoryCombo : [],
        typeCombo:        Array.isArray(r.typeCombo)     ? r.typeCombo     : [],
        itemCombo:        Array.isArray(r.itemCombo)     ? r.itemCombo     : [],
        transactionCount: Number(r.transactionCount || 0),
        quantity:         Number(r.quantity         || 0),
        revenueHt:        Number(r.revenueHt        || 0),
        revenue:          Number(r.revenueHt        || 0),
      });
    };
    const preAggregated = new Set<string>();
    if (scopedIds.length) {
      const aggRows: any[] = await this.spaceSalesScopeService.analyseBatchSemaphore.run(() => queryWithWorkMem<any[]>(
        this.prisma,
        readBasketAggSql({ tenantId, spaceId, eventIds: scopedIds, shopScopeClause, spaceTimezone }),
      ));
      for (const r of aggRows) { preAggregated.add(r.eventId); pushRow(r); }
    }

    // 2. Repli brut pour les events sans ligne pré-agrégée (pas encore ré-agrégés depuis la
    //    création de la table, ou sans vente) : ancienne requête, inchangée, sur ce reste seul.
    const rawWindows = scope.windows.filter(w => !preAggregated.has(w.id));
    if (!rawWindows.length) {
      await this.writeBasketsCache(tenantId, spaceId, missing, out, scope.windows);
      return out;
    }
    const valuesSql = Prisma.join(
      rawWindows.map(w => Prisma.sql`(${w.id}::text, ${w.windowStart}::timestamp, ${w.windowEnd}::timestamp, ${w.tagId}::text, ${w.eventIntegrationId}::text)`),
      ', ',
    );

    // CTE `tx` : UNE ligne par transaction, avec ses deux ensembles de libellés.
    // `ARRAY_AGG(DISTINCT … ORDER BY …)` garantit que « Bières, Consigne » et
    // « Consigne, Bières » tombent dans le même bucket. Les mêmes prédicats
    // obligatoires que getEventTimelineBatch sont repris à l'identique
    // (status='V', deletedAt IS NULL, scope tenant/intégration/PdV) — cf. BUG-028
    // et BUG-108. Un panier à N lignes ne produit qu'UNE ligne ici : c'est ce qui
    // évite le double comptage au dénominateur.
    // BUG-144-01 : même sémaphore que getEventTimelineBatch.
    const rows: any[] = await this.spaceSalesScopeService.analyseBatchSemaphore.run(() => queryWithWorkMem<any[]>(this.prisma, Prisma.sql`
      WITH ev("eventId", "windowStart", "windowEnd", "tagId", "eventIntegrationId") AS (VALUES ${valuesSql}),
      tx AS (
        SELECT
          t.id                                                            AS "txId",
          ev."eventId"                                                    AS "eventId",
          TO_CHAR(DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone}), 'HH24:MI') AS minute,
          -- BUG-136-01 : la minute DATEE, meme semantique que getEventTimelineBatch.
          -- Sans elle, buildBasketFilterPredicate (qui n applique PAS skipMinute) evalue
          -- les bornes DATEES du curseur horaire contre un simple HH24:MI et renvoie false
          -- pour toutes les lignes des qu un event franchit minuit : donuts paniers vides.
          TO_CHAR(DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone}), 'YYYY-MM-DD"T"HH24:MI') AS "minuteLocal",
          COALESCE(mem."spaceElementId", t."locationId")                  AS "shopId",
          COALESCE(se.name, t."locationName", t."locationId")             AS "shopName",
          COALESCE(se.attributes::jsonb->>'originalType', se.type::text)  AS "shopType",
          se.attributes::jsonb->>'area'                                   AS "shopArea",
          ARRAY_AGG(DISTINCT pc.name ORDER BY pc.name)                    AS "categoryCombo",
          ARRAY_AGG(DISTINCT pt.name ORDER BY pt.name)                    AS "typeCombo",
          ARRAY_AGG(DISTINCT COALESCE(mi.name, ti."productName")
                    ORDER BY COALESCE(mi.name, ti."productName"))         AS "itemCombo",
          SUM(ti.quantity)::integer                                       AS quantity,
          SUM(
            ti."unitPrice" * ti.quantity
            / (1 + ti."vat" / 100)
          )::numeric(12,2)                                                AS "revenueHt"
        FROM ev
        INNER JOIN "WeezeventTransaction" t
          ON t."transactionDate" >= ev."windowStart"
         AND t."transactionDate" <  ev."windowEnd"
         -- BUG-146-01 (legacy) : tag du conteneur du club quand l'event y est lié — les jours
         -- à double affiche, la fenêtre seule mélangeait les caisses des deux clubs. tagId
         -- NULL (event non lié, source CSV sans tag) → fenêtre seule, comme avant. Ignoré dès
         -- que eventIntegrationId est posé (ci-dessous) : ce tag n'est alors plus rafraîchi
         -- par aucun pipeline et devient périmé à chaque rollover de saison (le conteneur
         -- change), ce qui viderait le paniers/timeline sans que rien d'autre à l'écran ne
         -- le signale (constaté sur SFP-Perpignan, tag encore sur la saison 25-26).
         AND (ev."eventIntegrationId" IS NOT NULL OR ev."tagId" IS NULL OR t."eventId" = ev."tagId")
         -- BUG-368-02 : eventIntegrationId explicite, prioritaire et robuste — même rôle que
         -- tagId ci-dessus mais sans dépendre d'un conteneur de saison Weezevent.
         AND (ev."eventIntegrationId" IS NULL OR t."integrationId" = ev."eventIntegrationId")
         AND t."tenantId" = ${tenantId}
         ${integrationClause}
         AND t.status = 'V'
         AND t."deletedAt" IS NULL
        INNER JOIN "WeezeventTransactionItem" ti
          ON ti."transactionId" = t.id
        LEFT JOIN "WeezeventLocationShopMapping" mem
          ON mem."weezeventLocationId" = t."locationId"
         AND mem."tenantId"         = ${tenantId}
        LEFT JOIN "SpaceElement" se
          ON se.id = mem."spaceElementId"
        LEFT JOIN "WeezeventProductMapping" wpm
          ON wpm."weezeventProductId" = ti."productId"
         AND wpm."tenantId" = ${tenantId}
        LEFT JOIN "MenuItem" mi
          ON mi.id = wpm."menuItemId"
        LEFT JOIN "ProductType" pt
          ON pt.id = mi."typeId"
        LEFT JOIN "ProductCategory" pc
          ON pc.id = mi."categoryId"
        WHERE ${shopScopeClause}
        GROUP BY
          t.id, ev."eventId", DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone}),
          COALESCE(mem."spaceElementId", t."locationId"),
          COALESCE(se.name, t."locationName", t."locationId"),
          se.type, se.attributes
      )
      SELECT
        "eventId", minute, "minuteLocal", "shopId", "shopName", "shopType", "shopArea",
        "categoryCombo", "typeCombo", "itemCombo",
        COUNT(*)::integer                AS "transactionCount",
        SUM(quantity)::integer           AS quantity,
        SUM("revenueHt")::numeric(12,2)  AS "revenueHt"
      FROM tx
      GROUP BY
        "eventId", minute, "minuteLocal", "shopId", "shopName", "shopType", "shopArea",
        "categoryCombo", "typeCombo", "itemCombo"
      ORDER BY "eventId", "minuteLocal" ASC
    `));

    for (const r of rows) pushRow(r);

    await this.writeBasketsCache(tenantId, spaceId, missing, out, scope.windows);
    return out;
  }

  /**
   * Volume NON MAPPÉ des ventes de l'Analyse (BUG-137-01) : lignes dont le produit
   * externe n'a pas de WeezeventProductMapping, ou dont le PdV n'a pas de
   * WeezeventLocationShopMapping vers cet espace.
   *
   * INFORMATIF UNIQUEMENT — décision JLH 2026-08-24 (après aller-retour) : ces ventes
   * restent COMPTÉES dans toutes les vues, sous le libellé « Non mappées ». Cet
   * endpoint ne filtre rien ; il alimente le bandeau de la page, qui distingue
   * « rien vendu » de « rien de mappé » (piège BUG-300-01) et pointe le travail
   * restant en Data Integration. Cause unique mesurée en base : produit importé au
   * catalogue mais jamais associé à un menu item à l'étape 3 du wizard (0 ligne à
   * productId NULL sur 786 882 lignes non mappées).
   * Mêmes fenêtres, même scope d'intégration et mêmes prédicats de lecture
   * (status 'V', deletedAt) que event-timeline / transaction-baskets. Les ventes
   * mappées vers les shops d'un AUTRE espace ne sont pas comptées ici : elles
   * n'appartiennent pas à cet écran.
   * Retourne { [eventId]: { unmappedLines, unmappedUnits, unmappedRevenueHt,
   * unmappedProductLines, unmappedPosLines } } — ids demandés absents → zéros.
   */
  /** BUG-143-01 : même écriture par event que getEventTimelineBatch. */
  private async writeBasketsCache(
    tenantId: string,
    spaceId: string,
    eventIds: string[],
    out: Record<string, any[]>,
    windows: { id: string; windowStart: Date; windowEnd: Date }[],
  ): Promise<void> {
    await Promise.all(
      eventIds.map(id =>
        this.redis.set(this.spaceCacheService.EVENT_BASKETS_CACHE_KEY(tenantId, spaceId, id), out[id], {
          ttl: this.spaceSalesScopeService.eventBatchCacheTtl(windows, id),
        }),
      ),
    );
  }

  async getAnalyseUnmappedBatch(spaceId: string, eventIds: string[], tenantId: string): Promise<Record<string, any>> {
    const uniqueIds = [...new Set(eventIds.filter(Boolean))].slice(0, 100);
    const zero = () => ({
      unmappedLines: 0,
      unmappedUnits: 0,
      unmappedRevenueHt: 0,
      unmappedProductLines: 0,
      unmappedPosLines: 0,
    });
    const out: Record<string, any> = Object.fromEntries(uniqueIds.map(id => [id, zero()]));
    if (!uniqueIds.length) return out;

    // BUG-144-01 : caché par event comme event-timeline/transaction-baskets — REMPLACE la
    // décision BUG-137-01 (« jamais caché ») : l'endpoint re-scannait 786k lignes brutes à
    // CHAQUE visite. La fraîcheur d'un re-mapping est désormais garantie par l'invalidation
    // à l'écriture de mapping (MappingsService → spaces:unmapped:*), plus par l'absence de
    // cache. TTL long pour un event passé, court sinon — même règle que les deux autres.
    const cachedEntries = await Promise.all(
      uniqueIds.map(async id => [id, await this.redis.get<any>(this.spaceCacheService.EVENT_UNMAPPED_CACHE_KEY(tenantId, spaceId, id))] as const),
    );
    const missing: string[] = [];
    for (const [id, cached] of cachedEntries) {
      if (cached != null) out[id] = cached;
      else missing.push(id);
    }
    if (!missing.length) return out;

    const scope = await this.spaceSalesScopeService.resolveEventSalesScope(spaceId, missing, tenantId);
    if (!scope) return out;
    const { integrationClause, valuesSql, shopIds } = scope;

    // BUG-144-01 : même sémaphore que les deux autres endpoints batch.
    const rows: any[] = await this.spaceSalesScopeService.analyseBatchSemaphore.run(() => queryWithWorkMem<any[]>(this.prisma, Prisma.sql`
      WITH ev("eventId", "windowStart", "windowEnd", "tagId", "eventIntegrationId") AS (VALUES ${valuesSql})
      SELECT
        ev."eventId"                                                        AS "eventId",
        COUNT(ti."id")::int                                                 AS "unmappedLines",
        COALESCE(SUM(ti."quantity"), 0)::float8                             AS "unmappedUnits",
        COALESCE(SUM(ti."unitPrice" * ti."quantity" / (1 + ti."vat" / 100)), 0)::float8 AS "unmappedRevenueHt",
        COUNT(ti."id") FILTER (WHERE wpm."menuItemId" IS NULL)::int         AS "unmappedProductLines",
        COUNT(ti."id") FILTER (WHERE mem."spaceElementId" IS NULL)::int     AS "unmappedPosLines"
      FROM ev
      INNER JOIN "WeezeventTransaction" t
        ON t."transactionDate" >= ev."windowStart"
       AND t."transactionDate" <  ev."windowEnd"
       -- BUG-146-01 (legacy) / BUG-368-02 : mêmes clauses tag conteneur + integrationId que
       -- event-timeline/transaction-baskets, y compris le bypass du tag dès que
       -- eventIntegrationId est posé (tag non rafraîchi au rollover de saison, cf. commentaire
       -- détaillé sur getTransactionBasketsBatchRaw).
       AND (ev."eventIntegrationId" IS NOT NULL OR ev."tagId" IS NULL OR t."eventId" = ev."tagId")
       AND (ev."eventIntegrationId" IS NULL OR t."integrationId" = ev."eventIntegrationId")
       AND t."tenantId" = ${tenantId}
       ${integrationClause}
       AND t.status = 'V'
       AND t."deletedAt" IS NULL
      INNER JOIN "WeezeventTransactionItem" ti
        ON ti."transactionId" = t.id
      LEFT JOIN "WeezeventLocationShopMapping" mem
        ON mem."weezeventLocationId" = t."locationId"
       AND mem."tenantId" = ${tenantId}
      LEFT JOIN "WeezeventProductMapping" wpm
        ON wpm."weezeventProductId" = ti."productId"
       AND wpm."tenantId" = ${tenantId}
      WHERE (mem."spaceElementId" IS NULL OR mem."spaceElementId" = ANY(${shopIds}))
        AND (wpm."menuItemId" IS NULL OR mem."spaceElementId" IS NULL)
      GROUP BY ev."eventId"
    `));

    for (const r of rows) {
      if (!(r.eventId in out)) continue;
      out[r.eventId] = {
        unmappedLines: Number(r.unmappedLines || 0),
        unmappedUnits: Number(r.unmappedUnits || 0),
        unmappedRevenueHt: Number(r.unmappedRevenueHt || 0),
        unmappedProductLines: Number(r.unmappedProductLines || 0),
        unmappedPosLines: Number(r.unmappedPosLines || 0),
      };
    }

    // BUG-144-01 : écriture par event, zéros compris (« rien de non mappé » est un
    // résultat) — même TTL différencié que les deux autres endpoints batch.
    await Promise.all(
      missing.map(id =>
        this.redis.set(this.spaceCacheService.EVENT_UNMAPPED_CACHE_KEY(tenantId, spaceId, id), out[id], {
          ttl: this.spaceSalesScopeService.eventBatchCacheTtl(scope.windows, id),
        }),
      ),
    );
    return out;
  }
}
