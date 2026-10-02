import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { WeezeventClientService } from '../weezevent-client.service';

/**
 * Écriture d'un lot d'événements Weezevent et des lieux associés.
 */
@Injectable()
export class WeezeventEventBatchWriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weezeventClient: WeezeventClientService,
  ) {}

    private readonly logger = new Logger(WeezeventEventBatchWriterService.name);

    /**
     * Get all existing event IDs as a Map for O(1) lookup
     */
    async getExistingEventsMap(tenantId: string, integrationId: string): Promise<Map<string, { syncedAt: Date }>> {
        const events = await this.prisma.salesEvent.findMany({
            where: { tenantId, integrationId },
            select: { externalId: true, syncedAt: true },
        });

        return new Map(events.map(e => [e.externalId, { syncedAt: e.syncedAt }]));
    }

    /**
     * Process batch of events with optimized upserts
     */
    async processBatchEvents(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        events: any[],
        existingMap: Map<string, { syncedAt: Date }>,
        incrementalMode: boolean,
    ): Promise<{ created: number; updated: number; skipped: number; errors: number }> {
        const result = { created: 0, updated: 0, skipped: 0, errors: 0 };

        const parseDate = (dateStr: string | undefined): Date | null => {
            if (!dateStr) return null;
            const parsed = new Date(dateStr);
            return isNaN(parsed.getTime()) ? null : parsed;
        };

        const toCreate: any[] = [];
        const toUpdate: { weezeventId: string; data: any }[] = [];

        for (const apiEvent of events) {
            try {
                const weezeventId = apiEvent.id.toString();
                const existing = existingMap.get(weezeventId);

                // In incremental mode, skip if already synced recently
                if (incrementalMode && existing) {
                    const apiUpdatedAt = apiEvent.updated_at ? new Date(apiEvent.updated_at) : null;
                    if (apiUpdatedAt && existing.syncedAt >= apiUpdatedAt) {
                        result.skipped++;
                        continue;
                    }
                }

                // Extract status as string (API returns object with name/title)
                const eventStatus = apiEvent.status as any;
                const statusValue = typeof eventStatus === 'object' && eventStatus?.name 
                    ? eventStatus.name 
                    : (typeof eventStatus === 'string' ? eventStatus : 'unknown');

                const eventData = {
                    name: apiEvent.name || `Event ${apiEvent.id}`,
                    organizationId,
                    startDate: parseDate(apiEvent.live_start || apiEvent.start_date),
                    endDate: parseDate(apiEvent.live_end || apiEvent.end_date),
                    description: apiEvent.description || apiEvent.name || null,
                    location: apiEvent.location || apiEvent.venue || null,
                    capacity: apiEvent.capacity || null,
                    status: statusValue,
                    metadata: apiEvent.metadata || null,
                    rawData: apiEvent as any,
                    syncedAt: new Date(),
                };

                if (existing) {
                    toUpdate.push({ weezeventId, data: eventData });
                } else {
                    toCreate.push({
                        externalId: weezeventId,
                        tenantId,
                        integrationId,
                        ...eventData,
                    });
                    // Add to map for subsequent checks
                    existingMap.set(weezeventId, { syncedAt: new Date() });
                }
            } catch (error) {
                this.logger.error(`Failed to process event ${apiEvent.id}`, error);
                result.errors++;
            }
        }

        // Batch create
        if (toCreate.length > 0) {
            const createResult = await this.prisma.salesEvent.createMany({
                data: toCreate,
                skipDuplicates: true,
            });
            result.created = createResult.count;
        }

        // Batch update using transaction
        if (toUpdate.length > 0) {
            await this.prisma.$transaction(
                toUpdate.map(({ weezeventId, data }) =>
                    this.prisma.salesEvent.update({
                        where: { tenantId_integrationId_externalId: { tenantId, integrationId, externalId: weezeventId } },
                        data,
                    })
                )
            );
            result.updated = toUpdate.length;
        }

        return result;
    }

    // ==================== LOCATIONS SYNC ====================

    /**
     * Sync locations directly from WeezPay API for all events of this tenant.
     * Called at the end of syncEventsIncremental (non-blocking).
     */
    async syncLocationsFromApi(tenantId: string, integrationId: string, organizationId: string): Promise<void> {
        const events = await this.prisma.salesEvent.findMany({
            where: { tenantId, integrationId },
            select: { id: true, externalId: true },
        });

        if (events.length === 0) {
            this.logger.debug(`No events found for tenant ${tenantId}, skipping location sync`);
            return;
        }

        this.logger.log(`Syncing locations for ${events.length} events (tenant ${tenantId})`);

        let totalUpserted = 0;

        for (const event of events) {
            try {
                let page = 1;
                let hasMore = true;

                while (hasMore) {
                    const response = await this.weezeventClient.getLocations(
                        tenantId,
                        integrationId,
                        organizationId,
                        event.externalId,
                        { page, perPage: 100 },
                    );

                    const locations = response.data;

                    for (const loc of locations) {
                        await this.prisma.salesLocation.upsert({
                            where: { tenantId_integrationId_externalId: { tenantId, integrationId, externalId: String(loc.id) } },
                            create: {
                                externalId: String(loc.id),
                                tenantId,
                                integrationId,
                                eventId: event.id,
                                name: loc.name || loc.public_name || `Location ${loc.id}`,
                                type: loc.type ?? null,
                                rawData: loc,
                                syncedAt: new Date(),
                            },
                            update: {
                                name: loc.name || loc.public_name || `Location ${loc.id}`,
                                type: loc.type ?? null,
                                rawData: loc,
                                syncedAt: new Date(),
                            },
                        });
                        totalUpserted++;
                    }

                    hasMore = response.meta.current_page < response.meta.total_pages;
                    page++;
                }
            } catch (err) {
                this.logger.warn(
                    `Failed to sync locations for event ${event.externalId}: ${(err as Error).message}`,
                );
            }
        }

        this.logger.log(`✅ Locations sync: upserted ${totalUpserted} locations for tenant ${tenantId}`);
    }
}
