import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../core/database/prisma.service';
import { QueueService, AggregationJobEnqueueData } from '../../core/queue/queue.service';
import { RedisService } from '../../core/redis/redis.service';
import { eventBatchCachePatterns } from '../../shared/constants/event-batch-cache';
import { MappingsService } from '../mappings/mappings.service';
import {
  EventDayFields,
  resolveEventTransactionWindow,
} from '../../shared/utils/event-window.util';

/**
 * Résultat de résolution de fenêtre pour un event (BUG-329-02/330-02, docs/bugs/).
 * `integration-range` (BUG-368-02, 2026-08-25) : mode PRIORITAIRE — l'Event porte
 * explicitement `integrationId`, posé à la création (bulkCreateEvents). Attribution = la
 * bonne intégration ET la fenêtre calendaire, sans jamais regarder `t.eventId` : élimine
 * toute détection de "conteneur de saison" pour les events qui l'utilisent.
 * `container-range` (BUG-146-01, règle Bertrand 25/08, LEGACY — cohabite avec integration-range
 * pour les tenants pas encore migrés) : l'event est lié au CONTENEUR de saison de son club
 * (`Event.weezeventEventId` → « STADE FRANÇAIS 25-26 », « PARIS FOOTBALL CLUB »…) —
 * attribution = tag du conteneur ET fenêtre portes→fin. Sans le tag, deux events le même
 * jour au même stade (foot PFC l'après-midi, rugby SFP le soir) se partageaient les mêmes
 * ventes par fenêtres qui se recouvrent : 80 343,07 € comptés deux fois sur Jean Bouin
 * (mesuré en base, fiche 145-01).
 */
type EventWindow =
  | { mode: 'exact'; salesEventId: string }
  | { mode: 'integration-range'; integrationId: string; start: Date; end: Date }
  | { mode: 'container-range'; salesEventId: string; start: Date; end: Date }
  | { mode: 'range'; start: Date; end: Date };

// BUG-338-02 (docs/bugs/) : même seuil que resolveEventSalesScope (spaces.service.ts,
// MAX_EVENT_SPAN_DAYS, fix du 2026-08-04) — un WeezeventEvent/SalesEvent "conteneur de saison"
// (toute la billetterie de la saison regroupée sous un seul id Weezevent) casse le rattachement
// exact par eventId introduit par BUG-330-02 : CE conteneur a bien un eventId non-null sur 100%
// de ses transactions, mais cet id ne correspond à AUCUN match précis. Contrairement au fix du
// 04/08 (qui lit Event.eventDate/eventEndDate — fiable seulement quand un Event "saison" a été
// créé avec un span réaliste), on ne peut PAS se fier aux dates déclarées du SalesEvent lui-même
// ici : vérifié sur un tenant réel, le `live_start`/`live_end` Weezevent d'un conteneur de saison
// peut être un artefact étroit (13h observées) alors que ses transactions couvrent 10 mois — la
// seule mesure fiable est l'étalement RÉEL des transactions qui lui sont effectivement liées.
const MAX_EVENT_SPAN_DAYS = 2;

@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private mappingsService: MappingsService,
    // BUG-143-01 : RedisService injecté directement (RedisModule est @Global) plutôt que
    // via SpacesService — une dépendance vers SpacesService créerait un cycle de modules.
    private redis: RedisService,
  ) {}

  /**
   * Get events with their processing status for a space
   */
  async getEventsTimelineStatus(tenantId: string, spaceId: string, integrationId?: string) {
    this.logger.log(`Getting events timeline status for space ${spaceId}`);

    // Vague 1 — toutes les requêtes indépendantes en parallèle (y compris la résolution des locationIds)
    const now = new Date();
    const [space, events, futureEventsCount, allJobs, dataPointGroups] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId } }),
      this.prisma.event.findMany({
        where: { tenantId, spaceId, eventDate: { lte: now } },
        orderBy: { eventDate: 'desc' },
      }),
      this.prisma.event.count({ where: { tenantId, spaceId, eventDate: { gt: now } } }),
      this.prisma.aggregationJobLog.findMany({
        where: { tenantId, spaceId },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.spaceRevenueMinuteAgg.groupBy({
        by: ['weezeventEventId'],
        where: { tenantId, spaceId },
        _count: { _all: true },
      }),
    ]);

    if (!space) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    const dataPointsByEvent = new Map(
      dataPointGroups.map((g) => [g.weezeventEventId, Number(g._count._all ?? 0)]),
    );

    // Index : event.id → dernier job (allJobs déjà triés desc par startedAt)
    const latestJobByEvent = new Map<string, (typeof allJobs)[0]>();
    for (const job of allJobs) {
      const eventIds: string[] = (job.metadata as any)?.eventIds || [];
      for (const eid of eventIds) {
        if (!latestJobByEvent.has(eid)) {
          latestJobByEvent.set(eid, job);
        }
      }
    }

    const eventsWithStatus = events.map((event) => {
      const job = latestJobByEvent.get(event.id);
      const dataPoints = dataPointsByEvent.get(event.id) ?? 0;
      // BUG-367-02 : un job "completed" en historique ne veut plus rien dire une fois les
      // données réelles purgées (Démapper, BUG-366-02) — affichait "Agrégé" à côté de "—" data
      // points, contradiction visuelle constatée par l'utilisateur. Le statut suit désormais
      // aussi l'état ACTUEL des données, pas seulement le dernier job en historique.
      const aggregationStatus = job?.status === 'completed' && dataPoints === 0 ? 'pending' : (job?.status || 'pending');
      return {
        ...event,
        aggregationStatus,
        lastProcessedAt: job?.completedAt || null,
        transactionsProcessed: job?.transactionsProcessed || 0,
        dataPoints,
      };
    });

    // Vague 2 — unregisteredDates et transactionStats sont indépendants → parallèle
    // Filtre par integrationId uniquement : suppression du tableau de 100+ locationIds en paramètre
    let unregisteredDates: any[] = [];
    let transactionStats: {
      total: number;
      matched: number;
      unmatched: number;
      unmappedLocationIds: string[];
    } | null = null;

    if (integrationId) {
      const integrationFilter = Prisma.sql`AND t."integrationId" = ${integrationId}`;
      const eventDates = events.map((e) => new Date(e.eventDate).toISOString().slice(0, 10));

      const [transactionDates, totalRow, unmappedRows] = await Promise.all([
        this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT
            DATE(t."transactionDate") as "date",
            COUNT(*)::int as "transactionCount",
            SUM(t."amount")::float as "revenue"
          FROM "WeezeventTransaction" t
          WHERE t."tenantId" = ${tenantId}
            ${integrationFilter}
            AND DATE(t."transactionDate") NOT IN (
              -- BUG-368-02 : un Event qui déclare explicitement SON intégration ne peut plus
              -- "couvrir" par coïncidence de date les transactions d'une AUTRE intégration du
              -- même space (ex. SFP-Montauban ne couvre plus les transactions PFC du 06/09
              -- s'il n'existe aucun event PFC ce jour-là) — les events legacy sans
              -- integrationId gardent l'ancien comportement (coïncidence de date seule).
              SELECT DATE(e."eventDate") FROM "Event" e
              WHERE e."tenantId" = ${tenantId} AND e."spaceId" = ${spaceId}
                AND (e."integrationId" IS NULL OR e."integrationId" = ${integrationId})
            )
          GROUP BY DATE(t."transactionDate")
          ORDER BY DATE(t."transactionDate") DESC
        `),
        eventDates.length > 0
          ? this.prisma.$queryRaw<Array<{ total: bigint; matched: bigint }>>(Prisma.sql`
              SELECT
                COUNT(*)::bigint as total,
                COUNT(*) FILTER (
                  WHERE DATE(t."transactionDate") = ANY(ARRAY[${Prisma.join(eventDates)}]::date[])
                )::bigint as matched
              FROM "WeezeventTransaction" t
              WHERE t."tenantId" = ${tenantId}
                ${integrationFilter}
            `)
          : this.prisma.$queryRaw<Array<{ total: bigint; matched: bigint }>>(Prisma.sql`
              SELECT COUNT(*)::bigint as total, 0::bigint as matched
              FROM "WeezeventTransaction" t
              WHERE t."tenantId" = ${tenantId}
                ${integrationFilter}
            `),
        this.prisma.$queryRaw<Array<{ locationId: string }>>(Prisma.sql`
          SELECT DISTINCT t."locationId"
          FROM "WeezeventTransaction" t
          LEFT JOIN "WeezeventLocationShopMapping" m
            ON m."tenantId" = ${tenantId}
            AND m."weezeventLocationId" = t."locationId"
          WHERE t."tenantId" = ${tenantId}
            ${integrationFilter}
            AND t."locationId" IS NOT NULL
            AND m."id" IS NULL
        `),
      ]);

      unregisteredDates = transactionDates;
      const total = Number(totalRow[0]?.total ?? 0);
      const matched = Number(totalRow[0]?.matched ?? 0);
      transactionStats = {
        total,
        matched,
        unmatched: total - matched,
        unmappedLocationIds: unmappedRows.map((r) => r.locationId),
      };
    }

    return {
      events: eventsWithStatus,
      unregisteredDates,
      futureEventsCount,
      transactionStats,
      summary: {
        total: events.length,
        processed: eventsWithStatus.filter((e) => e.aggregationStatus === 'completed').length,
        skipped: eventsWithStatus.filter((e) => e.aggregationStatus === 'skipped').length,
        pending: eventsWithStatus.filter((e) => e.aggregationStatus === 'pending').length,
        failed: eventsWithStatus.filter((e) => e.aggregationStatus === 'failed').length,
      },
    };
  }

  /**
   * Process events: aggregate transaction data per event.
   * Version BullMQ — crée le job log (pending) et enqueue. Retourne immédiatement.
   * Le traitement réel est effectué par AggregationProcessor → executeProcessEvents().
   */
  async processEvents(tenantId: string, spaceId: string, eventIds?: string[], integrationId?: string) {
    this.logger.log(`Queueing process-events for space ${spaceId}`);

    const where: any = { tenantId, spaceId };
    if (eventIds?.length) where.id = { in: eventIds };

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { eventDate: 'asc' },
    });

    if (events.length === 0) {
      return { processed: 0, total: 0, results: [] };
    }

    const allEventIds = eventIds || events.map((e) => e.id);

    // Pré-création du job log — ID stable pour getJobProgress pendant l'exécution async
    const jobLog = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId,
        jobType: eventIds?.length ? 'incremental' : 'full',
        status: 'pending',
        fromDate: events[0].eventDate,
        toDate: events[events.length - 1].eventDate,
        metadata: { eventIds: allEventIds },
      },
    });

    await this.queueService.queueAggregationJob({
      type: 'process-events',
      tenantId,
      spaceId,
      jobLogId: jobLog.id,
      eventIds: allEventIds,
      integrationId,
    });

    return { jobId: jobLog.id, status: 'queued', total: events.length };
  }

  /**
   * Résout la fenêtre de rattachement transaction → event (BUG-328/329/330/338-02, docs/bugs/) :
   *
   * 1. Si l'Event DataFriday est lié à un vrai `SalesEvent` (`weezeventEventId` — posé par le
   *    matching auto BUG-021, la résolution manuelle, ou désormais `bulkCreateEvents`, voir
   *    BUG-331-02) ET que ce `SalesEvent` n'est PAS un conteneur de saison (BUG-338-02,
   *    `seasonContainerIds`) : rattachement EXACT via `WeezeventTransaction.eventId`, aucune
   *    ambiguïté possible même si les dates de deux events se recoupent (BUG-330-02).
   * 1bis. (BUG-146-01, règle Bertrand 25/08) Si le lien pointe un CONTENEUR de saison — donc
   *    identifie le CLUB, pas un match — : rattachement `container-range` = tag du conteneur ET
   *    fenêtre de transactions (même fenêtre que le mode 2 ci-dessous). Les jours à double
   *    affiche (deux clubs le même jour), chaque match ne capte plus que les ventes de son club.
   * 2. Sinon : fenêtre de la slide « Transactions prises en compte par Event » (fiche 147-01,
   *    `resolveEventTransactionWindow`) : minuit LOCAL du jour de début (jamais l'heure
   *    d'ouverture des portes — des ventes avant-match légitimes la précèdent parfois largement,
   *    BUG-360-02) → heure de fin déclarée (`eventEndTime`, posée sur le jour de fin, minuit
   *    franchi autorisé), repli journée calendaire pleine si aucune fin déclarée (règle Ulrich
   *    2026-08-25, pas d'heuristique). Frontière : si un voisin finit (fin déclarée) le jour où
   *    l'event commence, la fenêtre démarre à cette fin — la tranche minuit → fin du voisin lui
   *    appartient (slide : PFC-RC Lens fin 02h00 le 15/02 → SFP-Toulouse démarre à 02h00).
   *    S'applique aussi au mode 1bis.
   *
   * Le mode 2 filtre TOUJOURS `t."eventId" IS NULL OR t."eventId" IN (conteneurs de saison)` dans
   * la requête appelante — une transaction déjà liée avec CONFIANCE à un match précis (un
   * `SalesEvent` qui n'est PAS un conteneur) ne peut plus jamais être captée par la fenêtre
   * calendaire d'un AUTRE event (protection BUG-328/330-02 intacte) ; une transaction liée à un
   * conteneur de saison reste éligible, exactement comme une transaction non liée.
   */
  /**
   * BUG-338-02 (docs/bugs/) : identifie les `WeezeventEvent`/`SalesEvent` "conteneur de saison"
   * pour ce tenant/intégration — ceux dont les transactions RÉELLEMENT liées (`t.eventId`)
   * s'étalent sur plus de `MAX_EVENT_SPAN_DAYS`. Mesuré sur les transactions observées, PAS sur
   * les dates déclarées du SalesEvent (`startDate`/`endDate`, alimentées par `live_start`/
   * `live_end` côté Weezevent) : vérifié sur un tenant réel que ce champ peut être un artefact
   * étroit (13h) alors que les ventes qui lui sont liées couvrent 10 mois — donc pas fiable comme
   * signal de détection, contrairement à `Event.eventDate`/`eventEndDate` (resolveEventSalesScope,
   * spaces.service.ts, fix du 2026-08-04) qui reste fiable pour les tenants où un Event "saison" a
   * été créé avec un span réaliste.
   */
  private async resolveSeasonContainerEventIds(
    tenantId: string,
    integrationId: string | undefined,
  ): Promise<Set<string>> {
    const integrationClause = integrationId ? Prisma.sql`AND t."integrationId" = ${integrationId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<Array<{ eventId: string; minDate: Date; maxDate: Date }>>(Prisma.sql`
      SELECT t."eventId", MIN(t."transactionDate") AS "minDate", MAX(t."transactionDate") AS "maxDate"
      FROM "WeezeventTransaction" t
      WHERE t."tenantId" = ${tenantId}
        ${integrationClause}
        AND t."eventId" IS NOT NULL
        AND t."deletedAt" IS NULL
      GROUP BY t."eventId"
    `);
    const spanMs = MAX_EVENT_SPAN_DAYS * 86_400_000;
    const containerIds = new Set(
      rows.filter((r) => new Date(r.maxDate).getTime() - new Date(r.minDate).getTime() > spanMs).map((r) => r.eventId),
    );

    // BUG-361-02 (Le Mans FC) : le span OBSERVÉ ci-dessus ne détecte rien tant que l'intégration
    // vient d'être branchée — "LE MANS FC - SAISON 26/27" n'a que quelques heures de transactions
    // synchronisées le jour du fix, alors que son span DÉCLARÉ (startDate/endDate, alimentés par
    // live_start/live_end côté Weezevent — la fenêtre live réelle du calendrier saison, pas la
    // période de vente des billets) couvre déjà 9,5 mois, cohérent avec un vrai calendrier de
    // saison. Contrairement au cas narrow-artefact documenté en BUG-338-02 (13h déclarées pour
    // 10 mois observés — l'inverse de la situation ici), un span déclaré large n'est pas fiable
    // pour EXCLURE un conteneur, mais un span déclaré large EST un signal suffisant pour en
    // INCLURE un — les deux signaux se combinent en OU, jamais un seul ne peut faire perdre le
    // statut de conteneur détecté par l'autre.
    const declaredSpanEvents = await this.prisma.salesEvent.findMany({
      where: {
        tenantId,
        ...(integrationId ? { integrationId } : {}),
        startDate: { not: null },
        endDate: { not: null },
      },
      select: { id: true, startDate: true, endDate: true },
    });
    declaredSpanEvents
      .filter((e) => e.endDate!.getTime() - e.startDate!.getTime() > spanMs)
      .forEach((e) => containerIds.add(e.id));

    // Un SalesEvent Digifood (metadata.provider === 'digifood', digifood-ingestion.service.ts:239
    // upsertSiteAsEvent, §5.4 PLAN_INTEGRATION_DIGIFOOD.md) projette le SITE entier — jamais un
    // match précis — quel que soit le nombre de dates déjà synchronisées. Contrairement au
    // conteneur de saison Weezevent ci-dessus (déduit du span car aucun signal structurel
    // n'existe), ce cas est connu à la création : pas besoin d'attendre 2 jours de span observé
    // pour le classer conteneur, sous peine de bloquer toute intégration Digifood qui démarre
    // (un seul match synchronisé jusqu'ici a un span de quelques heures).
    const digifoodEvents = await this.prisma.salesEvent.findMany({
      where: {
        tenantId,
        ...(integrationId ? { integrationId } : {}),
        metadata: { path: ['provider'], equals: 'digifood' },
      },
      select: { id: true },
    });
    digifoodEvents.forEach((e) => containerIds.add(e.id));

    return containerIds;
  }

  private resolveEventWindow(
    event: {
      id: string;
      eventDate: Date;
      eventStartDate: Date | null;
      eventEndDate: Date | null;
      eventEndTime: string | null;
      weezeventEventId: string | null;
      integrationId: string | null;
    },
    spaceTimezone: string,
    seasonContainerIds: Set<string>,
    allSpaceEvents: ReadonlyArray<EventDayFields>,
  ): EventWindow {
    // BUG-338-02 : un lien exact vers un conteneur de saison n'identifie PAS un match précis
    // (100% des transactions de la saison partagent ce même eventId) — mais depuis
    // BUG-146-01 (règle Bertrand 25/08) il identifie le CLUB : combiné à la fenêtre
    // ci-dessous, il devient le mode `container-range` (tag ET fenêtre), qui empêche les
    // ventes de l'autre club d'entrer dans la fenêtre les jours à double affiche.
    // BUG-368-02 : un lien vers un match PRÉCIS (pas un conteneur) reste le rattachement le
    // plus fiable possible (zéro ambiguïté par construction) — prioritaire même si
    // `integrationId` est aussi posé sur cet Event.
    const isContainerLink = !!event.weezeventEventId && seasonContainerIds.has(event.weezeventEventId);
    if (event.weezeventEventId && !isContainerLink) {
      return { mode: 'exact', salesEventId: event.weezeventEventId };
    }

    // Fenêtre = règle de la slide « Transactions prises en compte par Event » (fiche 147-01) :
    // minuit local du jour de début → heure de fin déclarée (sinon journée pleine), fenêtre
    // avancée à la fin déclarée d'un voisin qui se termine le jour de début (frontière
    // partagée — sans elle, le repli sans tag (CSV Digifood) re-crée le double comptage de
    // la fiche 145-01 quand deux events se suivent). Logique partagée avec le lecteur
    // `resolveEventSalesScope` (spaces.service.ts) via event-window.util.
    const { start, end } = resolveEventTransactionWindow(event, spaceTimezone, allSpaceEvents);

    // BUG-368-02 : `integrationId` explicite prioritaire sur le tag conteneur legacy — plus
    // besoin de deviner via resolveSeasonContainerEventIds (span observé/déclaré, cold-start),
    // ni de dépendre d'un backfill manuel par tenant (BUG-146-01).
    if (event.integrationId) {
      return { mode: 'integration-range', integrationId: event.integrationId, start, end };
    }

    // BUG-146-01 (LEGACY, cohabite avec integration-range) : un lien conteneur devient
    // `container-range` (tag du club ET fenêtre) — le tag sépare les clubs les jours à double
    // affiche, la fenêtre démarrant à minuit évite de retronquer les ventes avant-match
    // (BUG-360-02).
    return isContainerLink
      ? { mode: 'container-range', salesEventId: event.weezeventEventId as string, start, end }
      : { mode: 'range', start, end };
  }

  /**
   * Logique d'exécution réelle — appelée par AggregationProcessor.
   * Met à jour AggregationJobLog en DB + progression BullMQ au fil du traitement.
   */
  async executeProcessEvents(job: Job<AggregationJobEnqueueData>) {
    const { tenantId, spaceId, eventIds, integrationId, jobLogId } = job.data;
    this.logger.log(`Executing process-events for space ${spaceId} (LogId: ${jobLogId})`);

    await this.prisma.aggregationJobLog.update({
      where: { id: jobLogId },
      data: { status: 'running' },
    });
    await job.updateProgress(0);

    const where: any = { tenantId, spaceId };
    if (eventIds?.length) where.id = { in: eventIds };

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { eventDate: 'asc' },
    });

    const results: any[] = [];
    let processedCount = 0;

    // BUG-329-02 : nécessaire pour combiner eventEndTime (heure locale) à eventDate/eventEndDate
    // (jours calendaires) via combineDayAndLocalTime.
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { timezone: true } });
    const spaceTimezone = space?.timezone || 'Europe/Paris';

    // BUG-338-02 : calculé UNE fois pour tout le run (pas par event) — un conteneur de saison est
    // le même pour tous les matchs de cette intégration.
    const seasonContainerIds = await this.resolveSeasonContainerEventIds(tenantId, integrationId);

    // Fiche 147-01 : la frontière de fenêtre (fin déclarée d'un voisin qui se termine le jour de
    // début) a besoin de TOUS les events de l'espace, pas seulement du batch — en re-agrégation
    // incrémentale (`eventIds` fourni), le voisin peut être hors batch.
    const allSpaceEvents: EventDayFields[] = eventIds?.length
      ? await this.prisma.event.findMany({
          where: { tenantId, spaceId },
          select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true, eventEndTime: true },
        })
      : events;

    try {
      // Step 1 of the wizard saves `integration.id` as `weezeventLocationId` in
      // WeezeventLocationSpaceMapping. We verify the integration is mapped to this space.
      if (integrationId) {
        const spaceLink = await this.prisma.locationSpaceMapping.findFirst({
          where: { tenantId, salesLocationId: integrationId },
        });
        if (!spaceLink) {
          throw new Error(`Integration ${integrationId} is not mapped to any space. Complete step 1 of the wizard.`);
        }
        if (spaceLink.spaceId !== spaceId) {
          throw new Error(`Integration ${integrationId} is mapped to a different space (${spaceLink.spaceId}).`);
        }
      }

      for (const event of events) {
        try {
          const eventDate = new Date(event.eventDate);

          // BUG-328/329/330/338-02 + fiche 147-01 : rattachement exact via eventId quand l'Event
          // est lié à un SalesEvent qui n'est pas un conteneur de saison, sinon fenêtre
          // minuit local → fin déclarée (repli journée pleine) avec frontière au voisin —
          // voir resolveEventWindow / resolveEventTransactionWindow.
          const window = this.resolveEventWindow(event, spaceTimezone, seasonContainerIds, allSpaceEvents);
          const eventLinkClause = seasonContainerIds.size
            ? Prisma.sql`(t."eventId" IS NULL OR t."eventId" IN (${Prisma.join([...seasonContainerIds])}))`
            : Prisma.sql`t."eventId" IS NULL`;
          const matchClause =
            window.mode === 'exact'
              ? Prisma.sql`t."eventId" = ${window.salesEventId}`
              : window.mode === 'integration-range'
                // BUG-368-02 : la bonne intégration ET la fenêtre calendaire — jamais
                // `t.eventId`. Robuste par construction : pas de dépendance à la détection
                // de conteneur de saison, fonctionne même sans historique de transactions.
                ? Prisma.sql`t."integrationId" = ${window.integrationId} AND t."transactionDate" >= ${window.start} AND t."transactionDate" < ${window.end}`
                : window.mode === 'container-range'
                  // BUG-146-01 (LEGACY) : tag du conteneur du club ET fenêtre portes→fin —
                  // une vente de l'AUTRE club dans la même fenêtre (jour à double affiche)
                  // est exclue.
                  ? Prisma.sql`t."eventId" = ${window.salesEventId} AND t."transactionDate" >= ${window.start} AND t."transactionDate" < ${window.end}`
                  : Prisma.sql`${eventLinkClause} AND t."transactionDate" >= ${window.start} AND t."transactionDate" < ${window.end}`;

          // Efface les anciennes lignes de cet event avant re-agrégation — scopé par
          // integrationId quand il est fourni (BUG-317-02) : sinon, retraiter l'intégration B
          // effaçait aussi la contribution déjà écrite par l'intégration A pour ce même event
          // partagé (un Event DataFriday est partagé au niveau de l'espace, pas de l'intégration).
          const deleteWhere: any = { tenantId, spaceId, weezeventEventId: event.id };
          if (integrationId) deleteWhere.integrationId = integrationId;
          await this.prisma.spaceRevenueMinuteAgg.deleteMany({ where: deleteWhere });
          await this.prisma.spaceRevenueMinuteItemAgg.deleteMany({ where: deleteWhere });

          // Filtres dynamiques (SQL fragments composables)
          const integrationClause = integrationId
            ? Prisma.sql`AND t."integrationId" = ${integrationId}`
            : Prisma.sql``;

          // Agrégation DB-level : JOIN + GROUP BY + INSERT en une seule requête
          // Aucune donnée chargée en mémoire Node.js — élimination du findMany + JS loop
          //
          // BUG-014 (corrigé ici) : la version précédente écrivait pm."menuItemId" (un id de
          // MenuItem, via une JOIN vers WeezeventProductMapping) dans la colonne "spaceElementId"
          // — censée contenir le vrai id du shop/PDV mappé (WeezeventLocationShopMapping). Deux
          // conséquences : (1) "Par shop" groupait en réalité par article vendu, pas par shop
          // physique (une location vendant 17 articles devenait 17 "shops" fantômes) ; (2) la JOIN
          // vers WeezeventProductMapping étant une INNER JOIN, toute vente d'un produit non encore
          // mappé à un MenuItem disparaissait silencieusement de l'agrégat shop-level. Le vrai
          // spaceElementId vient de "WeezeventLocationShopMapping" (LEFT JOIN : une location non
          // mappée reste visible avec spaceElementId NULL, cohérent avec le comportement déjà
          // documenté de get_space_shop_details). weezeventMerchantId venait aussi de
          // t."locationId" dupliqué au lieu du vrai t."merchantId".
          //
          // BUG-015 (corrigé ici) : "revenueHt" ne divisait jamais par (1 + vat/100) — le montant
          // stocké était en réalité du TTC, pas du HT, contrairement à getEventTimelineBatch
          // (spaces.service.ts:1156-1159, référence "vivante" correcte : même formule
          // ti."unitPrice" * ti.quantity / (1 + ti."vat" / 100), sans la remise — la remise n'est
          // gérée que côté écriture ici, ordre : net TTC (après remise) puis détaxe).
          const dataPoints = await this.prisma.$executeRaw(Prisma.sql`
            INSERT INTO "SpaceRevenueMinuteAgg"
              ("id","tenantId","spaceId","minute","timezone","weezeventEventId","weezeventLocationId","weezeventMerchantId","spaceElementId","integrationId","revenueHt","transactionsCount","itemsCount","createdAt","updatedAt")
            SELECT
              gen_random_uuid(),
              ${tenantId},
              ${spaceId},
              date_trunc('minute', t."transactionDate"),
              'Europe/Paris',
              ${event.id},
              t."locationId",
              t."merchantId",
              lsm."spaceElementId",
              MAX(t."integrationId"),
              SUM((ti."unitPrice" * ti."quantity" - COALESCE(ti."reduction", 0)) / (1 + ti."vat" / 100)),
              -- BUG-135-01 : COUNT(DISTINCT t."id"), PAS COUNT(ti."id"). Cette colonne
              -- s'appelle "transactionsCount" mais comptait des LIGNES de vente : sur
              -- « Le Mans-Brest » du 22/08/2026, 13 925 lignes pour 5 721 tickets réels —
              -- et c'est ce 13 925 que remontaient Event.transactionCount, le RPC
              -- get_space_shop_details et le panier moyen (4,71 € au lieu de 11,46 €).
              -- L'autre writer de la même colonne (space-aggregation.service.ts) comptait
              -- déjà COUNT(DISTINCT t.id) : les deux sont désormais alignés.
              -- Additif par construction : le grain est (minute × locationId × merchantId ×
              -- spaceElementId) et une transaction n'a qu'une date, une location et un
              -- merchant — elle tombe donc dans exactement un groupe.
              COUNT(DISTINCT t."id")::int,
              SUM(ti."quantity")::float8,
              NOW(),
              NOW()
            FROM "WeezeventTransaction" t
            JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
            LEFT JOIN "WeezeventLocationShopMapping" lsm
              ON lsm."weezeventLocationId" = t."locationId" AND lsm."tenantId" = ${tenantId}
            WHERE t."tenantId" = ${tenantId}
              ${integrationClause}
              AND ${matchClause}
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
          `);

          // SpaceProductRevenueDailyAgg — même approche DB-level
          // Twin de BUG-015 : ce bloc ne divisait pas non plus par (1 + vat/100), écrivant du TTC
          // dans une colonne "revenueHt" — même défaut que SpaceRevenueMinuteAgg, manqué lors du
          // fix initial car dans une requête distincte du même bloc de code.
          await this.prisma.$executeRaw(Prisma.sql`
            INSERT INTO "SpaceProductRevenueDailyAgg"
              ("id","tenantId","spaceId","day","weezeventProductId","integrationId","revenueHt","quantity","createdAt","updatedAt")
            SELECT
              gen_random_uuid(),
              ${tenantId},
              ${spaceId},
              ${eventDate}::date,
              ti."productId",
              MAX(t."integrationId"),
              SUM((ti."unitPrice" * ti."quantity" - COALESCE(ti."reduction", 0)) / (1 + ti."vat" / 100)),
              SUM(ti."quantity")::float8,
              NOW(),
              NOW()
            FROM "WeezeventTransaction" t
            JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
            WHERE t."tenantId" = ${tenantId}
              ${integrationClause}
              AND ${matchClause}
              AND t."deletedAt" IS NULL
              AND ti."productId" IS NOT NULL
            GROUP BY ti."productId"
            ON CONFLICT ("tenantId","spaceId","day","weezeventProductId")
            DO UPDATE SET
              "integrationId" = EXCLUDED."integrationId",
              "revenueHt" = EXCLUDED."revenueHt",
              "quantity" = EXCLUDED."quantity",
              "updatedAt" = NOW()
          `);

          // SpaceRevenueMinuteItemAgg — sert getEventTimelineBatch (grain event × minute ×
          // shop × article). Même FROM/JOIN que le bloc SpaceRevenueMinuteAgg ci-dessus
          // (BUG-014 : spaceElementId via WeezeventLocationShopMapping en LEFT JOIN sur
          // t."locationId", jamais via une jointure produit), avec ti."productId" et
          // t."locationName" ajoutés au GROUP BY.
          //
          // revenueHt ne soustrait PAS ti."reduction" — volontairement différent des deux
          // blocs ci-dessus. C'est la formule historique de getEventTimelineBatch
          // (spaces.service.ts), qui ne l'a jamais soustraite ; la préserver ici évite de
          // changer les chiffres déjà affichés sur Analyse/Inventory/Live le jour où ce
          // endpoint bascule sur cette table. Ne pas "corriger" pour aligner sur BUG-015 sans
          // validation métier explicite — cf. décision documentée dans le schema Prisma sur
          // SpaceRevenueMinuteItemAgg.
          //
          // AND t.status = 'V' : contrairement aux deux blocs ci-dessus, getEventTimelineBatch
          // filtre explicitement sur les transactions validées (spaces.service.ts) — sans ce
          // filtre ici, cette table inclurait des transactions non validées absentes de son
          // comportement actuel.
          await this.prisma.$executeRaw(Prisma.sql`
            INSERT INTO "SpaceRevenueMinuteItemAgg"
              ("id","tenantId","spaceId","minute","timezone","weezeventEventId","weezeventLocationId","weezeventLocationName","weezeventMerchantId","spaceElementId","weezeventProductId","integrationId","revenueHt","transactionsCount","itemsCount","createdAt","updatedAt")
            SELECT
              gen_random_uuid(),
              ${tenantId},
              ${spaceId},
              date_trunc('minute', t."transactionDate"),
              'Europe/Paris',
              ${event.id},
              t."locationId",
              t."locationName",
              t."merchantId",
              lsm."spaceElementId",
              ti."productId",
              MAX(t."integrationId"),
              SUM(ti."unitPrice" * ti."quantity" / (1 + ti."vat" / 100)),
              COUNT(DISTINCT t."id")::int,
              SUM(ti."quantity")::float8,
              NOW(),
              NOW()
            FROM "WeezeventTransaction" t
            JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
            LEFT JOIN "WeezeventLocationShopMapping" lsm
              ON lsm."weezeventLocationId" = t."locationId" AND lsm."tenantId" = ${tenantId}
            WHERE t."tenantId" = ${tenantId}
              ${integrationClause}
              AND ${matchClause}
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
          `);

          // BUG-033 (corrigé) : Event.revenue/transactionCount n'étaient jamais écrits par le
          // pipeline — SpaceRevenueMinuteAgg était alimenté ci-dessus mais le rollup n'était jamais
          // remonté sur l'Event lui-même, laissant ces colonnes null/0 à vie. On réutilise le même
          // agrégat que getEventStats() (cf. plus bas dans ce fichier) : SUM(revenueHt) /
          // SUM(transactionsCount) sur SpaceRevenueMinuteAgg pour cet event, juste après avoir écrit
          // les lignes ci-dessus — même source de données, même calcul, pas de nouvelle logique.
          const eventRollup = await this.prisma.spaceRevenueMinuteAgg.aggregate({
            where: { tenantId, spaceId, weezeventEventId: event.id },
            _sum: { revenueHt: true, transactionsCount: true },
          });
          const eventRevenue = Number(eventRollup._sum.revenueHt ?? 0);
          const eventTransactionCount = eventRollup._sum.transactionsCount ?? 0;
          // Trouvé le 2026-08-05 (retour utilisateur : "Avg Spend/Tx" et "Per Capita"
          // vides dans la fiche event malgré Revenue/Transactions renseignés) :
          // avgSpendPerTx/perCapita n'étaient JAMAIS calculés par ce pipeline — seul
          // un edit manuel du formulaire (events.service.ts) pouvait les poser.
          // avgSpendPerTx = simple dérivé revenue/transactionCount (même source que
          // ci-dessus). perCapita nécessite un dénominateur RÉEL (ticketsScanned/
          // ticketsSold, posés par le sync attendees, cf. commentaire plus bas dans
          // ce fichier) — reste `null` (pas 0) tant qu'aucune vraie donnée de
          // billetterie n'existe (ex. events QA simulés, jamais scannés).
          const attendees = event.ticketsScanned ?? event.ticketsSold ?? null;
          await this.prisma.event.update({
            where: { id: event.id },
            data: {
              revenue: eventRevenue,
              transactionCount: eventTransactionCount,
              avgSpendPerTx: eventTransactionCount > 0 ? Math.round((eventRevenue / eventTransactionCount) * 100) / 100 : null,
              perCapita: attendees && attendees > 0 ? Math.round((eventRevenue / attendees) * 100) / 100 : null,
              calculatedAt: new Date(),
            },
          });

          processedCount++;
          results.push({
            eventId: event.id, eventName: event.name, date: event.eventDate,
            dataPoints, status: 'success',
          });
        } catch (err) {
          results.push({ eventId: event.id, eventName: event.name, status: 'error', error: err.message });
        }

        // Mise à jour progression DB + BullMQ après chaque event traité
        await this.prisma.aggregationJobLog.update({
          where: { id: jobLogId },
          data: { transactionsProcessed: processedCount },
        });
        await job.updateProgress(Math.min(Math.round((processedCount / events.length) * 100), 99));
      }

      await this.prisma.aggregationJobLog.update({
        where: { id: jobLogId },
        data: { status: 'completed', completedAt: new Date(), transactionsProcessed: processedCount },
      });
      await job.updateProgress(100);

      // BUG-143-01 : les endpoints batch Analyse cachent leurs réponses par event (TTL 6 h
      // pour un event passé) — sans cette purge, une re-agrégation servirait des données
      // périmées jusqu'à expiration. Mêmes motifs que SpacesService.invalidateSpaceCache.
      for (const pattern of eventBatchCachePatterns(tenantId, spaceId)) {
        await this.redis.deletePattern(pattern);
      }

      // Auto-sync attendees for each successfully processed event.
      // Finds the matching WeezeventEvent(s) by date and queues an attendees sync
      // job so that ticketsScanned / perCapita metrics are up to date automatically.
      if (integrationId) {
        for (const r of results) {
          if (r.status !== 'success') continue;
          try {
            const eventDate = new Date(r.date);
            const nextDay = new Date(eventDate);
            nextDay.setDate(nextDay.getDate() + 1);
            const weezeventEvents = await this.prisma.salesEvent.findMany({
              where: {
                tenantId,
                integrationId,
                startDate: { gte: eventDate, lt: nextDay },
              },
              select: { id: true, externalId: true },
            });
            for (const we of weezeventEvents) {
              // BUG : `we.id` est le cuid interne DataFriday du SalesEvent, pas l'id
              // Weezevent réel — l'API attendees (`/events/:eventId/attendees`) attend
              // `externalId`. Avec `we.id`, cette synchro 404 systématiquement, pour
              // n'importe quel event, réel ou simulé (BUG-XXX, cf. docs/bugs/).
              await this.queueService.queueWeezeventSyncType(
                tenantId,
                'attendees',
                { eventId: we.externalId },
                integrationId,
              );
              this.logger.log(`Auto-queued attendees sync for WeezeventEvent ${we.externalId} (event ${r.eventId})`);
            }
          } catch (e) {
            // Non-blocking — attendees sync failure must not fail the aggregation job
            this.logger.warn(`Auto-attendees sync skipped for event ${r.eventId}: ${e.message}`);
          }
        }
      }
    } catch (err) {
      await this.prisma.aggregationJobLog.update({
        where: { id: jobLogId },
        data: { status: 'failed', error: err.message, completedAt: new Date() },
      });
      throw err;
    }

    return { jobId: jobLogId, processed: processedCount, total: events.length, results };
  }

  /**
   * Synchronize: cleanup + rebuild all aggregation data for a space.
   * Version BullMQ — enqueue un job full rebuild. Retourne immédiatement.
   */
  async synchronize(tenantId: string, spaceId: string, integrationId?: string) {
    this.logger.log(`Queueing synchronize for space ${spaceId}`);

    const events = await this.prisma.event.findMany({
      where: { tenantId, spaceId },
      orderBy: { eventDate: 'asc' },
      select: { id: true, eventDate: true },
    });

    const jobLog = await this.prisma.aggregationJobLog.create({
      data: {
        tenantId,
        spaceId,
        jobType: 'full',
        status: 'pending',
        fromDate: events[0]?.eventDate ?? new Date(),
        toDate: events[events.length - 1]?.eventDate ?? new Date(),
        metadata: { eventIds: events.map((e) => e.id) },
      },
    });

    await this.queueService.queueAggregationJob({
      type: 'synchronize',
      tenantId,
      spaceId,
      jobLogId: jobLog.id,
      integrationId,
    });

    return { jobId: jobLog.id, status: 'queued' };
  }

  /**
   * Logique de synchronisation réelle — appelée par AggregationProcessor.
   * Nettoie toutes les agrégats du space puis délègue à executeProcessEvents.
   */
  async executeSynchronize(job: Job<AggregationJobEnqueueData>) {
    const { tenantId, spaceId, jobLogId, integrationId } = job.data;
    this.logger.log(`Executing synchronize for space ${spaceId} (LogId: ${jobLogId})`);

    await this.prisma.aggregationJobLog.update({
      where: { id: jobLogId },
      data: { status: 'running' },
    });
    await job.updateProgress(2);

    // Phase 1: cleanup atomique (#9) — scopé par integrationId quand fourni (BUG-318-02) :
    // sinon, synchroniser l'intégration B purgeait aussi la contribution de l'intégration A pour
    // TOUT l'espace, avant de ne reconstruire que celle de B (executeProcessEvents ci-dessous est
    // déjà scopé, voir BUG-317-02).
    const cleanupWhere: any = { tenantId, spaceId };
    if (integrationId) cleanupWhere.integrationId = integrationId;
    await this.prisma.$transaction([
      this.prisma.spaceRevenueMinuteAgg.deleteMany({ where: cleanupWhere }),
      this.prisma.spaceProductRevenueDailyAgg.deleteMany({ where: cleanupWhere }),
      this.prisma.spaceRevenueMinuteItemAgg.deleteMany({ where: cleanupWhere }),
    ]);
    await job.updateProgress(5);

    // Phase 2: retraitement (executeProcessEvents gère le job log status + progression)
    const result = await this.executeProcessEvents(job);

    // Phase 3: résumé
    const summary = await this.prisma.spaceRevenueMinuteAgg.aggregate({
      where: { tenantId, spaceId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      _count: true,
    });

    return {
      ...result,
      summary: {
        totalRevenue: Number(summary._sum.revenueHt || 0),
        totalTransactions: summary._sum.transactionsCount || 0,
        totalItems: summary._sum.itemsCount || 0,
        aggregationRecords: summary._count,
      },
    };
  }

  /**
   * Marque un job log comme failed — utilisé par AggregationProcessor.onFailed.
   * updateMany (pas update) pour ne pas lever d'erreur si le job est déjà completed.
   */
  async markJobLogFailed(jobLogId: string, errorMessage: string) {
    await this.prisma.aggregationJobLog.updateMany({
      where: { id: jobLogId, status: { not: 'completed' } },
      data: { status: 'failed', error: errorMessage, completedAt: new Date() },
    });
  }

  /**
   * Get aggregation job progress — rich response for real-time progress indicator
   */
  async getJobProgress(tenantId: string, jobId: string) {
    const job = await this.prisma.aggregationJobLog.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const eventIds: string[] = (job.metadata as any)?.eventIds || [];
    const total = eventIds.length || 1;
    const current = job.transactionsProcessed || 0;

    const percentage =
      job.status === 'completed' ? 100
      : job.status === 'failed' || job.status === 'skipped' ? 0
      : Math.min(Math.round((current / total) * 100), 99);

    const elapsedMs = Date.now() - new Date(job.startedAt).getTime();
    const rowsPerSecond = elapsedMs > 0 && current > 0 ? Math.round((current / elapsedMs) * 1000) : 0;
    const estimatedTimeRemaining =
      rowsPerSecond > 0 && current < total
        ? Math.ceil((total - current) / rowsPerSecond)
        : null;

    const phase =
      job.status === 'completed' ? 'Done'
      : job.status === 'failed' ? 'Failed'
      : job.status === 'skipped' ? 'Skipped'
      : current === 0 ? 'Initializing...'
      : current >= total ? 'Finalizing...'
      : 'Processing transactions...';

    // Count aggregated data points written so far
    const aggregatedPoints = job.spaceId
      ? await this.prisma.spaceRevenueMinuteAgg.count({
          where: {
            tenantId,
            spaceId: job.spaceId,
            weezeventEventId: { in: eventIds.length ? eventIds : undefined },
          },
        })
      : 0;

    return {
      jobId: job.id,
      status: job.status,
      phase,
      percentage,
      current,
      total,
      rowsPerSecond,
      aggregatedPoints,
      estimatedTimeRemaining,
      error: job.error || null,
      completedAt: job.completedAt,
    };
  }

  /**
   * Mark an event as skipped — no sales data available or deliberately excluded.
   *
   * BUG-020 (corrigé) : "skipped" doit vouloir dire "aucune donnée" — sans purge, un event
   * traité avec succès puis marqué skip a posteriori gardait ses lignes SpaceRevenueMinuteAgg
   * (dataPoints > 0) sous un statut affiché "Skipped", incohérent pour l'utilisateur. La purge et
   * la création du job log sont dans une transaction pour rester cohérentes en cas d'échec partiel.
   *
   * SpaceProductRevenueDailyAgg n'est volontairement PAS purgée ici : elle est indexée par jour
   * calendaire (pas par eventId — cf. BUG-021/BUG-016), donc purger par date risquerait de
   * supprimer les données d'un second event légitime le même jour sur le même espace.
   */
  async skipEvent(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const [{ count: purgedDataPoints }] = await this.prisma.$transaction([
      this.prisma.spaceRevenueMinuteAgg.deleteMany({
        where: { tenantId, spaceId, weezeventEventId: eventId },
      }),
      this.prisma.aggregationJobLog.create({
        data: {
          tenantId,
          spaceId,
          jobType: 'skip',
          status: 'skipped',
          fromDate: event.eventDate,
          toDate: event.eventDate,
          metadata: { eventIds: [eventId] },
        },
      }),
    ]);

    this.logger.log(
      `Event ${eventId} marked as skipped for space ${spaceId} (purged ${purgedDataPoints} existing data points)`,
    );
    return { eventId, status: 'skipped', purgedDataPoints };
  }

  /**
   * #10 — Contexte complet du step 4 en un seul appel.
   * Bundle : timeline + transactionStats + weezeventEvents + hasMappings.
   * Remplace les 7 appels séparés du mounted() du wizard.
   *
   * BUG-029 (corrigé) : hasMappings comptait tous les LocationShopMapping du TENANT entier, sans
   * scoping par intégration — une intégration B sans aucun mapping affichait hasMappings:true dès
   * qu'une intégration A du même tenant en avait un. Délègue maintenant à
   * MappingsService.hasShopMappingForIntegration, la même source utilisée par le wizard de mapping
   * (BUG-017), pour ne plus jamais diverger. Sans integrationId (legacy, paramètre optionnel),
   * conserve l'ancien comportement tenant-wide en repli.
   */
  async getStep4Context(tenantId: string, spaceId: string, integrationId?: string) {
    const [timeline, weezeventEvents, hasMappings, seasonContainerIds] = await Promise.all([
      this.getEventsTimelineStatus(tenantId, spaceId, integrationId),
      integrationId
        ? this.prisma.salesEvent.findMany({
            where: { tenantId, integrationId },
            orderBy: { startDate: 'asc' },
          })
        : Promise.resolve([]),
      integrationId
        ? this.mappingsService.hasShopMappingForIntegration(tenantId, integrationId)
        : this.prisma.locationShopMapping.count({ where: { tenantId } }).then((count) => count > 0),
      integrationId ? this.resolveSeasonContainerEventIds(tenantId, integrationId) : Promise.resolve(new Set<string>()),
    ]);

    // BUG-358/338-02 : un WeezeventEvent "conteneur" (saison Weezevent groupée sous un seul id,
    // ou site Digifood) ne désigne jamais un match précis — le signaler pour que le front n'en
    // fasse pas un candidat "Créer et lier tout" (créerait un faux Event DataFriday de plusieurs
    // mois, cf. docs/bugs/361_02).
    const weezeventEventsWithFlag = weezeventEvents.map((we) => ({
      ...we,
      isSeasonContainer: seasonContainerIds.has(we.id),
    }));

    return {
      ...timeline,
      weezeventEvents: weezeventEventsWithFlag,
      hasMappings,
    };
  }

  /**
   * Breakdown par shops et articles pour un événement donné.
   * Shops : depuis SpaceRevenueMinuteAgg (a weezeventEventId) — agrégé sur toutes les minutes.
   * Articles : depuis SpaceProductRevenueDailyAgg filtré par date de l'événement
   *            (le modèle n'a pas de weezeventEventId — on filtre par day).
   */
  async getEventBreakdown(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const eventDay = new Date(event.eventDate);
    eventDay.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(eventDay);
    nextDay.setDate(nextDay.getDate() + 1);

    const [shopAggs, productAggs] = await Promise.all([
      this.prisma.spaceRevenueMinuteAgg.groupBy({
        by: ['weezeventLocationId', 'spaceElementId'],
        where: { tenantId, spaceId, weezeventEventId: eventId },
        _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      }),
      this.prisma.spaceProductRevenueDailyAgg.groupBy({
        by: ['weezeventProductId'],
        where: { tenantId, spaceId, day: { gte: eventDay, lt: nextDay } },
        _sum: { revenueHt: true, quantity: true },
      }),
    ]);

    // Resolve human-readable names for shops and products
    const locationIds = shopAggs.map((s) => s.weezeventLocationId).filter(Boolean) as string[];
    const productIds = productAggs.map((p) => p.weezeventProductId).filter(Boolean) as string[];

    const [locations, products] = await Promise.all([
      locationIds.length
        ? this.prisma.salesLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true } })
        : [],
      productIds.length
        ? this.prisma.salesProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
        : [],
    ]);

    const locationNameMap = new Map(locations.map((l) => [l.id, l.name] as [string, string]));
    const productNameMap = new Map(products.map((p) => [p.id, p.name] as [string, string]));

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      shops: shopAggs.map((s) => ({
        weezeventLocationId: s.weezeventLocationId,
        spaceElementId: s.spaceElementId,
        shopName: s.weezeventLocationId
          ? (locationNameMap.get(s.weezeventLocationId) ?? s.weezeventLocationId)
          : 'Inconnu',
        revenueHt: Number(s._sum.revenueHt ?? 0),
        transactionsCount: s._sum.transactionsCount ?? 0,
        itemsCount: s._sum.itemsCount ?? 0,
      })),
      products: productAggs.map((p) => ({
        weezeventProductId: p.weezeventProductId,
        productName: productNameMap.get(p.weezeventProductId) ?? p.weezeventProductId,
        revenueHt: Number(p._sum.revenueHt ?? 0),
        quantity: p._sum.quantity ?? 0,
      })),
    };
  }

  /**
   * Statistiques agrégées (totaux) pour un événement donné.
   */
  async getEventStats(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const agg = await this.prisma.spaceRevenueMinuteAgg.aggregate({
      where: { tenantId, spaceId, weezeventEventId: eventId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      _count: { _all: true },
    });

    const shopCount = await this.prisma.spaceRevenueMinuteAgg.findMany({
      where: { tenantId, spaceId, weezeventEventId: eventId, weezeventLocationId: { not: null } },
      select: { weezeventLocationId: true },
      distinct: ['weezeventLocationId'],
    });

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      revenueHt: Number(agg._sum.revenueHt ?? 0),
      transactionsCount: agg._sum.transactionsCount ?? 0,
      itemsCount: agg._sum.itemsCount ?? 0,
      shopCount: shopCount.length,
      aggregationRecords: agg._count._all,
    };
  }

  /**
   * CA par minute pour un événement — alimente l'onglet "CA / minute" dans le détail event.
   * Retourne chaque minute avec au moins 1 transaction, ordonnée chronologiquement.
   */
  async getEventMinuteChart(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId, spaceId },
      select: { id: true, name: true, eventDate: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);
    }

    const rows = await this.prisma.spaceRevenueMinuteAgg.groupBy({
      by: ['minute'],
      where: { tenantId, spaceId, weezeventEventId: eventId },
      _sum: { revenueHt: true, transactionsCount: true, itemsCount: true },
      orderBy: { minute: 'asc' },
    });

    return {
      eventId,
      eventName: event.name,
      eventDate: event.eventDate,
      data: rows.map((r) => ({
        minute: r.minute,
        revenueHt: Number(r._sum.revenueHt ?? 0),
        transactionsCount: r._sum.transactionsCount ?? 0,
        itemsCount: r._sum.itemsCount ?? 0,
      })),
    };
  }
}
