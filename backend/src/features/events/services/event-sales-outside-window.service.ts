import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { resolveEventTransactionWindow } from '../../../shared/utils/event-window.util';

export interface SalesOutsideWindow {
    /** Ventes validées de l'intégration de l'event, après son heure de fin, sans autre event pour les prendre. */
    count: number;
    firstAt: Date | null;
    lastAt: Date | null;
    /** Fin de fenêtre de l'event (instant UTC), pour afficher l'heure déclarée. */
    windowEnd: Date;
}

/** Ne regarde pas plus loin que cette durée après la fin déclarée (jamais au-delà du jour de fin). */
const LOOKAHEAD_MS = 12 * 60 * 60 * 1000;

/**
 * Une heure de fin saisie trop tôt coupe les ventes en silence (fenêtre 147-01) : elles arrivent de
 * Weezevent mais n'entrent dans aucun agrégat. Ce service les détecte sans rien changer à la règle.
 */
@Injectable()
export class EventSalesOutsideWindowService {
    constructor(private readonly prisma: PrismaService) {}

    async forEvent(eventId: string, tenantId: string, now: Date = new Date()): Promise<SalesOutsideWindow> {
        const event = await this.prisma.event.findFirst({
            where: { id: eventId, tenantId },
            select: {
                id: true,
                spaceId: true,
                eventDate: true,
                eventStartDate: true,
                eventEndDate: true,
                eventEndTime: true,
                integrationId: true,
                weezeventEvent: { select: { integrationId: true } },
            },
        });
        if (!event) throw new NotFoundException(`Event ${eventId} not found`);

        const space = event.spaceId
            ? await this.prisma.space.findUnique({ where: { id: event.spaceId }, select: { timezone: true } })
            : null;
        const timezone = space?.timezone || 'Europe/Paris';
        const { start, end } = resolveEventTransactionWindow(event, timezone);
        const empty: SalesOutsideWindow = { count: 0, firstAt: null, lastAt: null, windowEnd: end };

        const integrationId = event.integrationId ?? event.weezeventEvent?.integrationId ?? null;
        // Sans intégration connue, impossible de dire quelles ventes sont les siennes.
        if (!integrationId || end.getTime() > now.getTime()) return empty;

        // Fin de la plage regardée : fin déclarée + 12 h au plus, jamais au-delà de maintenant.
        const to = new Date(Math.min(end.getTime() + LOOKAHEAD_MS, now.getTime()));

        // Un autre event de la même intégration qui couvre ces instants les prend légitimement.
        const sameDay = new Date(start.getTime());
        const others = await this.prisma.event.findMany({
            where: {
                tenantId,
                id: { not: eventId },
                integrationId,
                eventDate: { gte: new Date(sameDay.getTime() - 2 * 86_400_000), lte: new Date(to.getTime() + 86_400_000) },
            },
            select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true, eventEndTime: true, spaceId: true },
        });
        const covered = others
            .map((o) => resolveEventTransactionWindow(o, timezone))
            .filter((w) => w.end > end && w.start < to);
        const notCovered = covered.length
            ? Prisma.sql`AND NOT (${Prisma.join(
                  covered.map((w) => Prisma.sql`(t."transactionDate" >= ${w.start} AND t."transactionDate" < ${w.end})`),
                  ' OR ',
              )})`
            : Prisma.empty;

        const rows = await this.prisma.$queryRaw<Array<{ count: bigint; first: Date | null; last: Date | null }>>(Prisma.sql`
            SELECT COUNT(*) AS count, MIN(t."transactionDate") AS first, MAX(t."transactionDate") AS last
            FROM "WeezeventTransaction" t
            WHERE t."tenantId" = ${tenantId}
              AND t."integrationId" = ${integrationId}
              AND t.status = 'V'
              AND t."deletedAt" IS NULL
              AND t."transactionDate" >= ${end}
              AND t."transactionDate" < ${to}
              ${notCovered}
        `);
        const row = rows[0];
        return { count: Number(row?.count ?? 0), firstAt: row?.first ?? null, lastAt: row?.last ?? null, windowEnd: end };
    }
}
