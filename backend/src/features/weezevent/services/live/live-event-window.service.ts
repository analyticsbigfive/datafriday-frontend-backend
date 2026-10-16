import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { resolveEventTransactionWindow } from '../../../../shared/utils/event-window.util';
import { EventSalesSourceService } from '../../../event-sales-sources/event-sales-source.service';

/** Un event en direct, avec sa fenêtre de transactions réelle (fuseau du space appliqué). */
export interface LiveEvent {
    id: string;
    tenantId: string;
    spaceId: string;
    /** Intégration réelle de l'event (Event.integrationId, sinon celle du SalesEvent lié), null si inconnue. */
    integrationId: string | null;
    windowStart: Date;
    windowEnd: Date;
    /** windowEnd + marge : au-delà, l'event n'est plus considéré en direct. */
    graceEnd: Date;
    /**
     * Intégrations des sources de ventes DÉCLARÉES de l'event (EventSalesSource, ADR multi-source).
     * Absent pour tous les évènements existants (source historique dérivée seule).
     */
    sourceIntegrationIds?: string[];
    /**
     * Présent (true) seulement pour un event SANS source historique mais avec des sources
     * déclarées : il n'est plus « sans intégration connue » (pas de mise en direct de toutes les
     * intégrations Weezevent du tenant, pas de groupe sans intégration).
     */
    declaredOnly?: true;
}

/** Events en direct regroupés par (space, intégration), grain d'un job d'agrégation. */
export interface LiveGroup {
    tenantId: string;
    spaceId: string;
    integrationId: string | null;
    eventIds: string[];
    /**
     * Évènements du groupe dont l'intégration du groupe est une source DÉCLARÉE (et non la source
     * historique) : leur clé de reconstruction est propre à la source. Absent sinon.
     */
    declaredEventIds?: string[];
}

/**
 * BUG-379-02 : seule définition de "cet event est en direct maintenant" côté worker.
 * L'ancien filet de sécurité calculait la fenêtre comme `eventEndDate` (minuit) + 3 h, en
 * ignorant `eventEndTime` : un match finissant à 23:50 n'était "live" que de 00:00 à 03:00.
 * Ici la fenêtre vient de `resolveEventTransactionWindow` (règle 147-01, fuseau du space),
 * la même que celle utilisée par l'agrégation pour rattacher les ventes.
 */
@Injectable()
export class LiveEventWindowService {
    private readonly logger = new Logger(LiveEventWindowService.name);

    /** Marge après la fin déclarée : règlement tardif, TPE hors ligne qui se resynchronise. */
    static readonly GRACE_MS = 3 * 60 * 60 * 1000;
    /** Borne DB : un event ne peut pas être en direct s'il a commencé il y a plus de 2 jours. */
    private static readonly LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

    constructor(
        private readonly prisma: PrismaService,
        private readonly salesSources: EventSalesSourceService,
    ) {}

    async findLiveEvents(now: Date = new Date()): Promise<LiveEvent[]> {
        const candidates = await this.prisma.event.findMany({
            where: {
                spaceId: { not: null },
                tenantId: { not: null },
                eventDate: {
                    gte: new Date(now.getTime() - LiveEventWindowService.LOOKBACK_MS),
                    lte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
                },
            },
            select: {
                id: true,
                tenantId: true,
                spaceId: true,
                eventDate: true,
                eventStartDate: true,
                eventEndDate: true,
                eventEndTime: true,
                integrationId: true,
                space: { select: { timezone: true } },
                weezeventEvent: { select: { integrationId: true } },
            },
        });

        const live: LiveEvent[] = [];
        for (const e of candidates) {
            const timezone = e.space?.timezone || 'Europe/Paris';
            const { start, end } = resolveEventTransactionWindow(e, timezone);
            const graceEnd = new Date(end.getTime() + LiveEventWindowService.GRACE_MS);
            if (now < start || now > graceEnd) continue;
            live.push({
                id: e.id,
                tenantId: e.tenantId as string,
                spaceId: e.spaceId as string,
                integrationId: e.integrationId ?? e.weezeventEvent?.integrationId ?? null,
                windowStart: start,
                windowEnd: end,
                graceEnd,
            });
        }
        await this.attachDeclaredSources(live, candidates);
        this.logger.debug(`${live.length} live event(s) at ${now.toISOString()}`);
        return live;
    }

    /**
     * Une seule lecture de EventSalesSource pour les events réellement en direct (jamais pour les
     * candidats). Sans source déclarée, l'event n'est pas modifié (sortie identique à l'existant).
     */
    private async attachDeclaredSources(live: LiveEvent[], candidates: ReadonlyArray<{ id: string; integrationId: string | null; weezeventEvent: unknown }>): Promise<void> {
        if (!live.length) return;
        const declared = await this.salesSources.listActiveForEvents(live.map((e) => e.id));
        if (!declared.size) return;
        const candidateById = new Map(candidates.map((c) => [c.id, c]));
        for (const event of live) {
            const sources = declared.get(event.id);
            if (!sources?.length) continue;
            event.sourceIntegrationIds = [...new Set(sources.map((s) => s.integrationId))];
            const candidate = candidateById.get(event.id);
            if (!event.integrationId && !candidate?.weezeventEvent) event.declaredOnly = true;
        }
    }

    /**
     * Un groupe par (space, intégration) : BUG-365-02, jamais un job multi-intégrations. Un event
     * qui a des sources déclarées entre dans un groupe PAR source (historique + déclarées) ; sans
     * source déclarée, la sortie est celle d'avant le multi-source.
     */
    static groupBySpaceAndIntegration(events: ReadonlyArray<LiveEvent>): LiveGroup[] {
        const groups = new Map<string, LiveGroup>();
        const add = (e: LiveEvent, integrationId: string | null, declared: boolean) => {
            const key = `${e.spaceId}::${integrationId ?? ''}`;
            const group = groups.get(key) ?? { tenantId: e.tenantId, spaceId: e.spaceId, integrationId, eventIds: [] };
            if (!group.eventIds.includes(e.id)) group.eventIds.push(e.id);
            if (declared) group.declaredEventIds = [...(group.declaredEventIds ?? []), e.id];
            groups.set(key, group);
        };
        for (const e of events) {
            if (!e.declaredOnly) add(e, e.integrationId, false);
            for (const sourceIntegrationId of e.sourceIntegrationIds ?? []) {
                if (sourceIntegrationId !== e.integrationId) add(e, sourceIntegrationId, true);
            }
        }
        return [...groups.values()];
    }

    /**
     * Groupes à déclencher quand UNE intégration vient d'écrire des ventes (webhook, polling) :
     * jamais les groupes des autres sources de l'event (une vente d'une source ne déclenche pas
     * le job d'une autre, ADR 4.4). Sans source déclarée : identique à l'ancien filtre.
     */
    static groupsForIntegration(events: ReadonlyArray<LiveEvent>, integrationId: string, tenantId: string): LiveGroup[] {
        const own = events.filter(
            (e) =>
                e.tenantId === tenantId &&
                (e.integrationId === integrationId || (!e.integrationId && !e.declaredOnly) || !!e.sourceIntegrationIds?.includes(integrationId)),
        );
        return LiveEventWindowService.groupBySpaceAndIntegration(own).filter(
            (g) => g.integrationId === integrationId || !g.integrationId,
        );
    }

    /**
     * Intégrations Weezevent qui ont au moins un event en direct. Un event sans intégration
     * connue (ni Event.integrationId ni SalesEvent lié) met en direct toutes les intégrations
     * Weezevent de son tenant : on ne sait pas laquelle vend, donc on les sync toutes.
     */
    async findLiveIntegrationIds(events: ReadonlyArray<LiveEvent>): Promise<Set<string>> {
        const ids = new Set<string>();
        const tenantsWithUnknown = new Set<string>();
        for (const e of events) {
            if (e.integrationId) ids.add(e.integrationId);
            else if (!e.declaredOnly) tenantsWithUnknown.add(e.tenantId);
            // Sources déclarées : une 2e intégration de ventes de l'event est aussi en direct.
            e.sourceIntegrationIds?.forEach((id) => ids.add(id));
        }
        if (tenantsWithUnknown.size) {
            const rows = await this.prisma.integration.findMany({
                where: { tenantId: { in: [...tenantsWithUnknown] }, enabled: true, provider: 'WEEZEVENT' },
                select: { id: true },
            });
            rows.forEach((r) => ids.add(r.id));
        }
        return ids;
    }
}
