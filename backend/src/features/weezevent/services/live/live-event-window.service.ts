import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { resolveEventTransactionWindow } from '../../../../shared/utils/event-window.util';

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
}

/** Events en direct regroupés par (space, intégration), grain d'un job d'agrégation. */
export interface LiveGroup {
    tenantId: string;
    spaceId: string;
    integrationId: string | null;
    eventIds: string[];
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

    constructor(private readonly prisma: PrismaService) {}

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
        this.logger.debug(`${live.length} live event(s) at ${now.toISOString()}`);
        return live;
    }

    /** Un groupe par (space, intégration) : BUG-365-02, jamais un job multi-intégrations. */
    static groupBySpaceAndIntegration(events: ReadonlyArray<LiveEvent>): LiveGroup[] {
        const groups = new Map<string, LiveGroup>();
        for (const e of events) {
            const key = `${e.spaceId}::${e.integrationId ?? ''}`;
            const group = groups.get(key) ?? {
                tenantId: e.tenantId,
                spaceId: e.spaceId,
                integrationId: e.integrationId,
                eventIds: [],
            };
            group.eventIds.push(e.id);
            groups.set(key, group);
        }
        return [...groups.values()];
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
            else tenantsWithUnknown.add(e.tenantId);
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
