import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { unlinkedEventIdsOnDate, weezeventEventIdsOnDate } from './event-weezevent-link.queries';

/**
 * BUG-021 — auto-lie Event (DataFriday) <-> WeezeventEvent (synced) par
 * `Event.weezeventEventId`, au lieu du rapprochement par égalité de DATE seule
 * fait jusqu'ici dans la RPC `get_space_shop_details`.
 *
 * N'auto-lie QUE quand exactement 1 Event non lié et 1 WeezeventEvent partagent
 * tenant+date calendaire — toute ambiguïté (plusieurs candidats d'un côté ou de
 * l'autre) est laissée non résolue pour éviter une association silencieuse
 * potentiellement fausse. `EventsService.resolveWeezeventLink` (PATCH
 * /events/:id/weezevent-link) reste disponible pour lier manuellement au besoin ; le banner de
 * résolution assistée (listAmbiguousWeezeventMatches) a été retiré le 2026-08-25 (BUG-361-02).
 */
@Injectable()
export class EventWeezeventLinkService {
    private readonly logger = new Logger(EventWeezeventLinkService.name);

    constructor(private readonly prisma: PrismaService) { }

    async relinkForTenantDate(tenantId: string, date: Date): Promise<void> {
        const unlinkedEvents = await unlinkedEventIdsOnDate(this.prisma, tenantId, date);
        if (unlinkedEvents.length !== 1) return;

        const weezeventCandidates = await weezeventEventIdsOnDate(this.prisma, tenantId, date);
        if (weezeventCandidates.length !== 1) return;

        await this.prisma.event.update({
            where: { id: unlinkedEvents[0].id },
            data: { weezeventEventId: weezeventCandidates[0].id },
        });

        this.logger.log(
            `Auto-linked Event ${unlinkedEvents[0].id} <-> WeezeventEvent ${weezeventCandidates[0].id} (tenant ${tenantId})`,
        );
    }
}
