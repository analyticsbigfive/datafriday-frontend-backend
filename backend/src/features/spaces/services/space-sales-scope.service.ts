import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { resolveEventTransactionWindow } from '../../../shared/utils/event-window.util';
import { Semaphore } from '../../../shared/utils/semaphore';
import { SpaceCacheService } from './space-cache.service';
import { SpaceCrudService } from './space-crud.service';

/**
 * Périmètre de ventes d'un espace pour un lot d'events (PdV, intégrations, fenêtres), cache
 * et sémaphore partagé qui borne la concurrence des lectures analytiques lourdes.
 */
@Injectable()
export class SpaceSalesScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly spaceCacheService: SpaceCacheService,
    private readonly spaceCrudService: SpaceCrudService,
  ) {}

  // BUG-144-01 : borne de concurrence de la section SQL des 3 endpoints batch Analyse —
  // 2 requêtes lourdes en parallèle, 32 en file, 60 s d'attente max → 503 explicite.
  // Les hits cache Redis ne passent PAS par cette file.
  readonly analyseBatchSemaphore = new Semaphore(2, 32, 60_000, 'analyse-batch');

  // CFG-2 Étape 2 : ElementType (enum Postgres) supprimé du typage — SpaceElement.type est
  // désormais un `string` libre (valeur inchangée ici, uniquement l'annotation TS). La
  // réécriture de cette liste elle-même contre `Department` est Étape 3, pas encore faite.
  private readonly EVENT_TIMELINE_SHOP_TYPES: string[] = ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'];

  /**
   * Resolve the shop (SpaceElement) ids attached to a space across all its configs —
   * floors + forecourt (v1) and zones (v2 builder). This does NOT depend on any event,
   * only on the space's current layout, so it's cached and shared across every event
   * timeline lookup for the space instead of being recomputed per event.
   */
  async resolveShopIdsForSpace(spaceId: string, tenantId: string): Promise<string[]> {
    return this.redis.getOrSet(
      this.spaceCacheService.SPACE_SHOPIDS_CACHE_KEY(tenantId, spaceId),
      async () => {
        const configs = await this.prisma.config.findMany({
          where: { space: { id: spaceId, tenantId } },
          select: { id: true },
        });
        const configIds = configs.map(c => c.id);
        const [floors, forecourt, zoneShops] = await Promise.all([
          this.prisma.spaceElement.findMany({
            where: { floor: { configId: { in: configIds } }, type: { in: this.EVENT_TIMELINE_SHOP_TYPES } },
            select: { id: true },
          }),
          this.prisma.spaceElement.findMany({
            where: { forecourt: { configId: { in: configIds } }, type: { in: this.EVENT_TIMELINE_SHOP_TYPES } },
            select: { id: true },
          }),
          // Builder v2 : shops rattachés aux Zones de l'espace
          this.prisma.spaceElement.findMany({
            where: { zone: { spaceId }, type: { in: this.EVENT_TIMELINE_SHOP_TYPES } },
            select: { id: true },
          }),
        ]);
        return [...new Set([...floors, ...forecourt, ...zoneShops].map(s => s.id))];
      },
      { ttl: this.spaceCacheService.SPACE_SHOPIDS_CACHE_TTL },
    );
  }

  /**
   * Résout, POUR UN ESPACE, tout ce qui ne varie pas d'un event à l'autre : contrôle
   * d'appartenance, fenêtres de dates par event, scope d'intégration et scope PdV.
   * Partagé par `getEventTimelineBatch` et `getTransactionBasketsBatch` — les deux
   * lisent les mêmes tables de ventes sur les mêmes bornes, et un scope qui divergerait
   * entre les deux ferait afficher deux périmètres différents sur le même écran.
   * Renvoie `null` quand il n'y a rien à interroger (aucun PdV, aucune fenêtre résolue).
   */
  async resolveEventSalesScope(
    spaceId: string,
    uniqueIds: string[],
    tenantId: string,
  ): Promise<{ integrationClause: Prisma.Sql; shopScopeClause: Prisma.Sql; valuesSql: Prisma.Sql; spaceTimezone: string; shopIds: string[]; windows: { id: string; windowStart: Date; windowEnd: Date; tagId: string | null; eventIntegrationId: string | null }[] } | null> {
    // All independent queries run in parallel: ownership check, event dates (tried
    // against both DataFriday Event and WeezeventEvent so the frontend can pass
    // either a DataFriday UUID or a WeezeventEvent CUID), integration scope,
    // shop IDs resolved from plan floors + forecourt, and the space's timezone
    // (used to display transaction hours in venue-local time, see BUG-270) —
    // none of this varies per event.
    // BUG-144-01 : les entrées STABLES (tous les events de l'espace, intégrations,
    // timezone) ne varient pas par event ni par paquet — cachées 60 s
    // (spaces:salesscope:*), purgées par invalidateSpaceCache, TTL court en filet
    // pour les écritures qui n'y passent pas (édition d'event). L'ancien 1er
    // event.findMany (events du batch seul) est SUPPRIMÉ : dérivable de la liste
    // complète, déjà nécessaire à BUG-339-02 (events voisins hors batch).
    // BUG-146-01 : le select porte aussi eventStartDate (même précédence de date que
    // l'agrégation — Montauban a un eventDate faux mais un eventStartDate juste) et
    // weezeventEventId (tag du conteneur de club — devient ev."tagId" des requêtes).
    // BUG-136-01 (conservé) : locationSpaceMapping en findMany, PAS findFirst — un
    // espace peut être alimenté par PLUSIEURS intégrations.
    const [, statics, weezeventEvents, shopIds] = await Promise.all([
      this.spaceCrudService.findOne(spaceId, tenantId),
      this.redis.getOrSet(
        this.spaceCacheService.SPACE_SALESSCOPE_CACHE_KEY(tenantId, spaceId),
        async () => {
          const [allSpaceEvents, locationMapping, spaceRow] = await Promise.all([
            this.prisma.event.findMany({
              where: { tenantId, spaceId },
              select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true, eventEndTime: true, weezeventEventId: true, integrationId: true },
            }),
            this.prisma.locationSpaceMapping.findMany({
              where: { tenantId, spaceId },
              select: { salesLocationId: true },
            }),
            this.prisma.space.findFirst({
              where: { id: spaceId, tenantId },
              select: { timezone: true },
            }),
          ]);
          return {
            allSpaceEvents,
            integrationIds: locationMapping.map(m => m.salesLocationId).filter(Boolean),
            spaceTimezone: spaceRow?.timezone || 'Europe/Paris',
          };
        },
        { ttl: this.spaceCacheService.SPACE_SALESSCOPE_CACHE_TTL },
      ),
      this.prisma.salesEvent.findMany({
        where: { id: { in: uniqueIds }, tenantId },
        select: { id: true, startDate: true, endDate: true },
      }),
      this.resolveShopIdsForSpace(spaceId, tenantId),
    ]);
    // NB : sur un hit Redis, les Date sont des strings ISO — tout le code aval fait
    // déjà `new Date(...)` avant usage (fenêtres, voisins — resolveEventTransactionWindow
    // tolère aussi les ISO strings directement).
    const { allSpaceEvents, integrationIds, spaceTimezone } = statics;

    if (shopIds.length === 0) return null;

    // Resolve date window per event: prefer DataFriday Event (accurate multi-day), fall
    // back to WeezeventEvent (when the frontend passes a Weezevent CUID). Same precedence
    // as the single-event method before batching.
    //
    // MAX_EVENT_SPAN_DAYS : certains "Event" ne représentent pas une session unique mais
    // un conteneur pour toute une saison (ex. "AJ AUXERRE - Saison 26/27", 356 jours) —
    // rien en amont (création de l'event, scoring predict-v2, filtres Analyse) ne les
    // distingue d'un vrai match. Demander le détail minute par minute sur une fenêtre
    // aussi large fait exploser le volume renvoyé (100k+ lignes, des dizaines de
    // secondes) ET fausse Event Predict : chaque event pèse dans la somme finale au
    // même ordre de grandeur qu'un vrai match (poids basé sur le score de similarité,
    // pas sur le volume de données), alors qu'une "saison" agrège des centaines de
    // jours sur un seul axe 24h — son total entre dans le calcul quasi sans réduction.
    // Seuil à 2 jours : couvre un event à cheval sur minuit (coup d'envoi tard le soir,
    // fin après 00h) sans risquer de repêcher un conteneur de saison (271 à 356 jours
    // observés). Les vrais events observés font 0 à 1 jour.
    const MAX_EVENT_SPAN_DAYS = 2;
    const dfMap = new Map(allSpaceEvents.map(e => [e.id, e]));
    const wzMap = new Map(weezeventEvents.map(e => [e.id, e]));

    // Fiche 147-01 (slide « Transactions prises en compte par Event » — remplace la lecture
    // « portes ±2 h » que BUG-146-01 avait faite de cette même slide : les boîtes « Ouverture
    // des portes 19h00 » y sont des repères, la bande de transactions démarre à 00h00) :
    // fenêtre = minuit LOCAL du jour de début → heure de fin déclarée (posée sur le jour de
    // fin — minuit franchi autorisé ; repli journée calendaire pleine), avancée à la fin
    // déclarée d'un voisin qui se termine le jour de début (ex. slide : « PFC - RC Lens »
    // fin 02h00 le 15/02 → « SFP-Toulouse » démarre le 15/02 à 02h00, pas à minuit — sans ça
    // la fenêtre de PFC absorbait le CA de SFP-Toulouse, 48k€ → 184k€, BUG-339-02).
    // MÊME logique que l'agrégation (resolveEventTransactionWindow, event-window.util) : la
    // divergence lecteur/writer était la cause des trois CA différents de la fiche 145-01.
    const windows: { id: string; windowStart: Date; windowEnd: Date; tagId: string | null; eventIntegrationId: string | null }[] = [];
    for (const id of uniqueIds) {
      const df = dfMap.get(id);
      const wz = wzMap.get(id);
      // BUG-146-01 : même précédence de jour que l'agrégation (`eventStartDate ?? eventDate`)
      // — un event dont eventDate est faux mais eventStartDate juste (SFP-Montauban, fiche
      // 145-01) obtient une fenêtre valide au lieu d'un `windowStart >= windowEnd` silencieux.
      const eventDate: Date | null = df
        ? new Date(df.eventStartDate ?? df.eventDate)
        : wz?.startDate
          ? new Date(wz.startDate)
          : null;
      if (!eventDate) continue; // event not found in either table → stays []
      let windowStart: Date;
      let windowEnd: Date;
      if (df) {
        ({ start: windowStart, end: windowEnd } = resolveEventTransactionWindow(
          df,
          spaceTimezone,
          allSpaceEvents,
        ));
      } else {
        // Repli WeezeventEvent (le front a passé un CUID Weezevent, pas un Event DataFriday) :
        // jour calendaire entier, endDate = dernier jour INCLUS → +1 jour.
        windowStart = eventDate;
        windowEnd = new Date(wz?.endDate ? new Date(wz.endDate) : eventDate);
        windowEnd.setDate(windowEnd.getDate() + 1);
      }
      if (windowStart >= windowEnd) continue; // fenêtre vide → stays []
      const spanDays = (windowEnd.getTime() - eventDate.getTime()) / 86_400_000;
      if (spanDays > MAX_EVENT_SPAN_DAYS) continue; // event-conteneur (saison…) → stays []
      // BUG-146-01 : tag du conteneur de club (ou d'un match précis) — devient ev."tagId".
      // Null (event non lié, ou id WeezeventEvent passé directement) → les requêtes
      // retombent sur la fenêtre seule, comportement d'avant.
      // BUG-368-02 : eventIntegrationId — mode prioritaire, robuste, ne dépend pas d'un
      // conteneur de saison ; coexiste avec tagId (legacy) pour les events pas encore migrés.
      windows.push({ id, windowStart, windowEnd, tagId: df?.weezeventEventId ?? null, eventIntegrationId: df?.integrationId ?? null });
    }
    if (!windows.length) return null;

    // Scope transactions to the integrationS that feed this space (étape 1 du wizard).
    // WeezeventLocationSpaceMapping.weezeventLocationId stores the integrationId, et un
    // espace peut en avoir PLUSIEURS (BUG-136-01) — d'où `= ANY(...)` et non `= <une>`.
    // If no mapping yet, fall back to tenant-wide (degraded mode, broader scope).
    const integrationClause = integrationIds.length
      ? Prisma.sql`AND t."integrationId" = ANY(${integrationIds})`
      : Prisma.sql``;

    // Shop scoping aligned with the get_space_shop_details RPC: keep sales whose
    // location has no shop mapping (they surface as the frontend's grey
    // "unattached" bucket) instead of silently dropping them — an unmapped POS
    // previously zeroed out every item-level view while the shop-level aggregate
    // kept showing revenue. Rows mapped to another space's shops stay excluded.
    // Without an integration scope the query is tenant-wide, so the unmapped branch
    // would leak other spaces' sales into this space's date windows — in that
    // degraded mode, require the mapping.
    // Décision JLH 2026-08-24 (BUG-137-01, après aller-retour) : les ventes non
    // mappées restent COMPTÉES, affichées « Non mappées » — le volume est mesuré à
    // part (getAnalyseUnmappedBatch → bandeau informatif), jamais filtré ici.
    const shopScopeClause = integrationIds.length
      ? Prisma.sql`(mem."spaceElementId" IS NULL OR mem."spaceElementId" = ANY(${shopIds}))`
      : Prisma.sql`mem."spaceElementId" = ANY(${shopIds})`;

    const valuesSql = Prisma.join(
      windows.map(w => Prisma.sql`(${w.id}::text, ${w.windowStart}::timestamp, ${w.windowEnd}::timestamp, ${w.tagId}::text, ${w.eventIntegrationId}::text)`),
      ', ',
    );

    return { integrationClause, shopScopeClause, valuesSql, spaceTimezone, shopIds, windows };
  }

  /**
   * Batched minute-level timeline for MULTIPLE events at once: minute × shop × menuItem.
   * Resolves ownership/integration-scope/shopIds ONCE for the space (they don't vary per
   * event) instead of once per event, then runs a single raw-SQL aggregate for all events
   * via a VALUES CTE joined by date-range predicate — instead of one query per event.
   * Returns a map keyed by the requested eventId (missing/not-found events map to []).
   * Sales whose location has no shop mapping are KEPT (shopId falls back to the raw
   * locationId, shopName to locationName) — same resilience as the shop-details RPC;
   * the frontend buckets them as "unattached" (grey). Only when the space has no
   * integration mapping (tenant-wide degraded scope) are unmapped rows excluded.
   *
   * PERF (event-timeline-item-agg) : lit désormais `SpaceRevenueMinuteItemAgg` (pré-agrégée
   * à l'écriture par aggregation.service.ts et space-aggregation.service.ts) au lieu de
   * scanner WeezeventTransaction/WeezeventTransactionItem à chaque appel. Le grain stocké
   * (event × minute × shop × article) est déjà celui dont cette méthode a besoin — il ne
   * reste que la résolution du nom/type/catégorie d'article (WeezeventProductMapping →
   * MenuItem → ProductType/ProductCategory), faite ici à la lecture pour rester à jour sans
   * jamais réinvalider l'agrégat.
   */
  /** BUG-143-01 : TTL par event — long si sa fenêtre de ventes est terminée (immuable),
   *  court sinon (event du jour, futur, ou sans fenêtre résolue — conteneur/inconnu). */
  eventBatchCacheTtl(
    windows: { id: string; windowEnd: Date }[],
    eventId: string,
  ): number {
    const w = windows.find(w => w.id === eventId);
    return w && new Date(w.windowEnd).getTime() < Date.now()
      ? this.spaceCacheService.EVENT_BATCH_CACHE_TTL_PAST
      : this.spaceCacheService.EVENT_BATCH_CACHE_TTL_LIVE;
  }
}
