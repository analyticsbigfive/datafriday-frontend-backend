import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';

interface SyncState {
    lastSyncedAt: Date | null;
    lastCursor: string | null;
    lastWeezeventId: string | null;
    lastUpdatedAt: Date | null;
    checkpoint: any | null;
}

/**
 * État de synchronisation incrémentale par intégration et type : configuration, curseur, erreurs, remise à zéro.
 */
@Injectable()
export class WeezeventSyncStateService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

    private readonly logger = new Logger(WeezeventSyncStateService.name);

    // ==================== HELPER METHODS ====================

    /**
     * Get integration config with validation
     */
    async getIntegrationConfig(tenantId: string, integrationId: string) {
        const integration = await this.prisma.integration.findFirst({
            where: { id: integrationId, tenantId, enabled: true },
            select: {
                id: true,
                enabled: true,
                weezevent: { select: { organizationId: true } },
            },
        });

        if (!integration) {
            throw new NotFoundException(`Weezevent integration ${integrationId} not found or disabled for tenant ${tenantId}`);
        }

        if (!integration.weezevent?.organizationId) {
            throw new BadRequestException(`Weezevent organizationId not configured for integration ${integrationId}`);
        }

        return { id: integration.id, enabled: integration.enabled, organizationId: integration.weezevent.organizationId };
    }

    /**
     * Get sync state from database
     */
    async getSyncState(tenantId: string, integrationId: string, syncType: string): Promise<SyncState> {
        const state = await this.prisma.weezeventSyncState.findUnique({
            where: {
                tenantId_integrationId_syncType: { tenantId, integrationId, syncType },
            },
        });

        return {
            lastSyncedAt: state?.lastSyncedAt || null,
            lastCursor: state?.lastCursor || null,
            lastWeezeventId: state?.lastWeezeventId || null,
            lastUpdatedAt: state?.lastUpdatedAt || null,
            checkpoint: state?.checkpoint || null,
        };
    }

    /**
     * Update sync state after successful sync
     */
    async updateSyncState(
        tenantId: string,
        integrationId: string,
        syncType: string,
        data: {
            lastSyncedAt?: Date;
            lastCursor?: string;
            lastWeezeventId?: string;
            lastUpdatedAt?: Date;
            lastSyncCount?: number;
            lastSyncDuration?: number;
            totalSynced?: number;
            consecutiveErrors?: number;
            lastError?: string | null;
            checkpoint?: any;
        },
    ) {
        await this.prisma.weezeventSyncState.upsert({
            where: {
                tenantId_integrationId_syncType: { tenantId, integrationId, syncType },
            },
            create: {
                tenantId,
                integrationId,
                syncType,
                ...data,
            },
            update: data,
        });
    }

    /**
     * Update sync state on error
     */
    async updateSyncStateError(tenantId: string, integrationId: string, syncType: string, error: string) {
        const current = await this.prisma.weezeventSyncState.findUnique({
            where: { tenantId_integrationId_syncType: { tenantId, integrationId, syncType } },
        });

        await this.prisma.weezeventSyncState.upsert({
            where: { tenantId_integrationId_syncType: { tenantId, integrationId, syncType } },
            create: {
                tenantId,
                integrationId,
                syncType,
                lastError: error,
                consecutiveErrors: 1,
            },
            update: {
                lastError: error,
                consecutiveErrors: (current?.consecutiveErrors || 0) + 1,
            },
        });
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get sync status for a tenant
     */
    async getSyncStatus(tenantId: string, integrationId?: string) {
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;

        const states = await this.prisma.weezeventSyncState.findMany({ where });

        return states.reduce((acc, state) => {
            const key = integrationId ? state.syncType : `${state.integrationId}:${state.syncType}`;
            acc[key] = {
                lastSyncedAt: state.lastSyncedAt,
                lastSyncCount: state.lastSyncCount,
                lastSyncDuration: state.lastSyncDuration,
                totalSynced: state.totalSynced,
                lastError: state.lastError,
                consecutiveErrors: state.consecutiveErrors,
            };
            return acc;
        }, {} as Record<string, any>);
    }

    /**
     * Reset sync state (force full sync next time)
     */
    async resetSyncState(tenantId: string, integrationId?: string, syncType?: string) {
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (syncType) where.syncType = syncType;

        await this.prisma.weezeventSyncState.deleteMany({ where });

        this.logger.log(`Reset sync state for tenant ${tenantId}${integrationId ? ` (integration: ${integrationId})` : ''}${syncType ? ` (type: ${syncType})` : ''}`);
    }
}
