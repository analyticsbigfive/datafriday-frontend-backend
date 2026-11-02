import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { AggregationService } from '../../aggregation/aggregation.service';
import { resolveEventTransactionWindow, type EventDayFields } from '../../../shared/utils/event-window.util';

/** Champs qui bornent la fenêtre de ventes d'un event (cf. resolveEventTransactionWindow). */
export interface EventWindowFields extends EventDayFields {
    tenantId?: string | null;
    spaceId?: string | null;
}

const time = (d: Date | string | null | undefined): number | null => (d == null ? null : new Date(d).getTime());

/**
 * Corriger la date ou l'heure de fin d'un event déplace la fenêtre de ventes (règle 147-01), mais
 * les agrégats déjà écrits gardent l'ancienne : le live restait coupé jusqu'au prochain passage
 * manuel ou de nuit (incident Jean Bouin 31/10 et 01/11). Ici l'event est ré-agrégé dès que sa
 * fenêtre change.
 */
@Injectable()
export class EventWindowReaggregateService {
    private readonly logger = new Logger(EventWindowReaggregateService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly aggregation: AggregationService,
    ) {}

    /** La fenêtre de ventes a-t-elle changé entre les deux versions de l'event ? */
    static windowChanged(before: EventWindowFields, after: EventWindowFields): boolean {
        return (
            time(before.eventDate) !== time(after.eventDate) ||
            time(before.eventStartDate) !== time(after.eventStartDate) ||
            time(before.eventEndDate) !== time(after.eventEndDate) ||
            (before.eventEndTime ?? null) !== (after.eventEndTime ?? null)
        );
    }

    /**
     * Met en file l'agrégation de l'event si sa fenêtre a changé et qu'elle a déjà commencé (un
     * match à venir n'a rien à réécrire). Ne lève jamais : l'enregistrement de l'event prime.
     * @returns true si un job a été mis en file
     */
    async reaggregateIfWindowChanged(before: EventWindowFields, after: EventWindowFields & { id: string }, now: Date = new Date()): Promise<boolean> {
        if (!after.tenantId || !after.spaceId) return false;
        if (!EventWindowReaggregateService.windowChanged(before, after)) return false;
        try {
            const space = await this.prisma.space.findUnique({ where: { id: after.spaceId }, select: { timezone: true } });
            const { start } = resolveEventTransactionWindow(after, space?.timezone || 'Europe/Paris');
            if (start.getTime() > now.getTime()) return false;
            await this.aggregation.processEvents(after.tenantId, after.spaceId, [after.id]);
            this.logger.log(`Event ${after.id} : fenêtre de ventes modifiée, ré-agrégation mise en file`);
            return true;
        } catch (error) {
            this.logger.warn(`Event ${after.id} : ré-agrégation après changement de fenêtre impossible (${(error as Error).message})`);
            return false;
        }
    }
}
