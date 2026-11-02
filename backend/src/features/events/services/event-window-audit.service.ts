import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service';
import { EventWindowReaggregateService, type EventWindowFields } from './event-window-reaggregate.service';

const iso = (d: Date | string | null | undefined): string | null => (d == null ? null : new Date(d).toISOString());

/** Valeurs qui bornent la fenêtre de ventes d'un event, sous forme comparable et lisible. */
export function windowSnapshot(e: EventWindowFields) {
    return {
        eventDate: iso(e.eventDate),
        eventStartDate: iso(e.eventStartDate),
        eventEndDate: iso(e.eventEndDate),
        eventEndTime: e.eventEndTime ?? null,
    };
}

/**
 * Journalise qui a changé la date ou l'heure de fin d'un event, avec l'ancienne valeur : une heure
 * de fin trop tôt coupe les ventes, et l'écraser faisait perdre la valeur d'origine (incident Jean
 * Bouin 31/10 et 01/11).
 */
@Injectable()
export class EventWindowAuditService {
    constructor(private readonly audit: AuditService) {}

    /** @returns true si une entrée a été écrite (fenêtre modifiée et auteur connu) */
    async recordIfWindowChanged(
        tenantId: string | null | undefined,
        userId: string | null | undefined,
        before: EventWindowFields,
        after: EventWindowFields & { id: string },
    ): Promise<boolean> {
        if (!tenantId || !userId) return false;
        if (!EventWindowReaggregateService.windowChanged(before, after)) return false;
        await this.audit.log({
            tenantId,
            userId,
            action: 'UPDATE',
            entity: 'Event',
            entityId: after.id,
            changes: { before: windowSnapshot(before), after: windowSnapshot(after) },
            metadata: { action: 'event-window-change' },
        });
        return true;
    }
}
