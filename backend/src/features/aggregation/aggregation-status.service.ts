import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { isEventOver } from '../../shared/utils/event-window.util';
import { EventWindowResolverService } from './event-window-resolver.service';
import { IntegrationTransactionStatsService } from './integration-transaction-stats.service';
import { MappingProgressService } from '../mappings/services/mapping-progress.service';

/**
 * État d'agrégation des événements d'une intégration (timeline, contexte de l'étape 4 de l'onboarding).
 */
@Injectable()
export class AggregationStatusService {
  constructor(
    private prisma: PrismaService,
    private readonly mappingProgressService: MappingProgressService,
    private windowResolver: EventWindowResolverService,
    private txStats: IntegrationTransactionStatsService,
  ) {}

  private readonly logger = new Logger(AggregationStatusService.name);

  /**
   * Get events with their processing status for a space
   */
  async getEventsTimelineStatus(tenantId: string, spaceId: string, integrationId?: string) {
    this.logger.log(`Getting events timeline status for space ${spaceId}`);

    // Vague 1 — toutes les requêtes indépendantes en parallèle (y compris la résolution des locationIds)
    const now = new Date();
    const [space, startedEvents, notStartedCount, allJobs, dataPointGroups] = await Promise.all([
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

    // Passé = TERMINÉ (fin réelle), pas `eventDate <= now` : le match du jour était listé
    // « en attente d'agrégation » dès minuit, avant la moindre vente. Un match en cours
    // compte avec les events à venir.
    const spaceTimezone = space.timezone || 'Europe/Paris';
    const events = startedEvents.filter((e) => isEventOver(e, spaceTimezone, now));
    const futureEventsCount = notStartedCount + (startedEvents.length - events.length);

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
      // Un seul scan par date + EXISTS par PdV, en cache 60 s (IntegrationTransactionStatsService),
      // à la place de trois parcours complets des transactions de l'intégration par affichage.
      const pastEventDates = events.map((e) => new Date(e.eventDate).toISOString().slice(0, 10));
      const stats = await this.txStats.compute({ tenantId, spaceId, integrationId, pastEventDates });
      unregisteredDates = stats.unregisteredDates;
      transactionStats = {
        total: stats.total,
        matched: stats.matched,
        unmatched: stats.unmatched,
        unmappedLocationIds: stats.unmappedLocationIds,
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
   * #10 — Contexte complet du step 4 en un seul appel.
   * Bundle : timeline + transactionStats + weezeventEvents + hasMappings.
   * Remplace les 7 appels séparés du mounted() du wizard.
   *
   * BUG-029 (corrigé) : hasMappings comptait tous les LocationShopMapping du TENANT entier, sans
   * scoping par intégration — une intégration B sans aucun mapping affichait hasMappings:true dès
   * qu'une intégration A du même tenant en avait un. Délègue maintenant à
   * MappingProgressService.hasShopMappingForIntegration, la même source utilisée par le wizard de mapping
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
        ? this.mappingProgressService.hasShopMappingForIntegration(tenantId, integrationId)
        : this.prisma.locationShopMapping.count({ where: { tenantId } }).then((count) => count > 0),
      this.windowResolver.resolveSeasonContainerEventIds(tenantId),
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
}
