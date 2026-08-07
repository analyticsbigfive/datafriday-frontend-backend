import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { WeezeventConfigDto } from '../dto/weezevent-config.dto';
import {
    CreateWeezeventInstanceDto,
    UpdateWeezeventInstanceDto,
} from '../dto/weezevent-instance.dto';
import { UpdateWeezeventWebhookDto } from '../dto/weezevent-webhook-config.dto';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

type PublicInstance = {
    id: string;
    name: string;
    clientId: string;
    organizationId: string | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
};

// Credentials déplacés dans la table 1-1 WeezeventIntegrationConfig (relation `weezevent`).
// Le contrat API reste plat (clientId/organizationId au premier niveau) → flatten ici.
const INSTANCE_SELECT = {
    id: true,
    name: true,
    enabled: true,
    createdAt: true,
    updatedAt: true,
    weezevent: { select: { clientId: true, organizationId: true } },
} as const;

type InstanceRow = {
    id: string;
    name: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    weezevent: { clientId: string; organizationId: string | null } | null;
};

@Injectable()
export class WeezeventIntegrationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
        private readonly spaceAccess: SpaceAccessService,
    ) { }

    private toPublicInstance(row: InstanceRow): PublicInstance {
        return {
            id: row.id,
            name: row.name,
            clientId: row.weezevent?.clientId ?? '',
            organizationId: row.weezevent?.organizationId ?? null,
            enabled: row.enabled,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    /**
     * Ids des Integration mappées à un espace accessible à `user`. Une instance non encore
     * mappée (ou mappée à un espace hors du périmètre de l'utilisateur) n'est pas un
     * « connecteur global » — elle reste réservée aux comptes à accès complet, comme le
     * reste des ressources sans espace accessible (cf. SpaceAccessService).
     *
     * ⚠️ `LocationSpaceMapping.salesLocationId` (alias historique "weezeventLocationId") vaut
     * ICI directement l'id de l'Integration — l'étape 1 du wizard mappe l'INSTANCE Weezevent
     * elle-même à un espace, pas une sous-`SalesLocation` (cf. front DataIntegrationView.
     * getSpaceForIntegration : `mapping.weezeventLocationId === integration.id`). Vérifié en
     * base : sur les mappings existants, `salesLocationId` correspond à un `Integration.id`,
     * jamais à un `SalesLocation.id` — ne PAS joindre via SalesLocation ici (autre concept,
     * utilisé par le mapping location→shop).
     */
    private async accessibleIntegrationIds(tenantId: string, user?: SpaceScopedUser): Promise<'ALL' | Set<string>> {
        if (!user || this.spaceAccess.hasFullAccess(user)) return 'ALL';
        const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
        if (accessible === 'ALL') return 'ALL';
        const mappings = await this.prisma.locationSpaceMapping.findMany({
            where: { tenantId, spaceId: { in: accessible } },
            select: { salesLocationId: true },
        });
        return new Set(mappings.map((m) => m.salesLocationId));
    }

    // ==================== Multi-instance API ====================

    async listInstances(tenantId: string, user?: SpaceScopedUser): Promise<PublicInstance[]> {
        await this.assertTenant(tenantId);
        const rows = await this.prisma.integration.findMany({
            where: { tenantId, provider: 'WEEZEVENT' },
            orderBy: { createdAt: 'asc' },
            select: INSTANCE_SELECT,
        });
        const accessibleIds = await this.accessibleIntegrationIds(tenantId, user);
        const visible = accessibleIds === 'ALL' ? rows : rows.filter((r) => accessibleIds.has(r.id));
        return visible.map((row) => this.toPublicInstance(row));
    }

    async getInstance(tenantId: string, instanceId: string, user?: SpaceScopedUser): Promise<PublicInstance> {
        const row = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'WEEZEVENT' },
            select: INSTANCE_SELECT,
        });
        if (!row) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }
        const accessibleIds = await this.accessibleIntegrationIds(tenantId, user);
        if (accessibleIds !== 'ALL' && !accessibleIds.has(row.id)) {
            throw new ForbiddenException("Vous n'avez pas accès à l'espace de cette intégration.");
        }
        return this.toPublicInstance(row);
    }

    /**
     * Returns decrypted credentials for an instance. Internal use (e.g. testing).
     */
    async getDecryptedCredentials(
        tenantId: string,
        instanceId: string,
    ): Promise<{ clientId: string; clientSecret: string }> {
        const row = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'WEEZEVENT' },
            select: { weezevent: { select: { clientId: true, clientSecret: true } } },
        });
        if (!row?.weezevent) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }
        return {
            clientId: row.weezevent.clientId,
            clientSecret: this.encryptionService.decrypt(row.weezevent.clientSecret),
        };
    }

    async createInstance(
        tenantId: string,
        dto: CreateWeezeventInstanceDto,
    ): Promise<PublicInstance> {
        await this.assertTenant(tenantId);

        const created = await this.prisma.integration.create({
            data: {
                tenantId,
                provider: 'WEEZEVENT',
                name: dto.name.trim(),
                enabled: dto.enabled ?? true,
                weezevent: {
                    create: {
                        clientId: dto.clientId.trim(),
                        clientSecret: this.encryptionService.encrypt(dto.clientSecret),
                        organizationId: dto.organizationId?.trim() || null,
                    },
                },
            },
            select: INSTANCE_SELECT,
        });

        await this.mirrorActiveInstanceToTenant(tenantId);
        return this.toPublicInstance(created);
    }

    async updateInstance(
        tenantId: string,
        instanceId: string,
        dto: UpdateWeezeventInstanceDto,
    ): Promise<PublicInstance> {
        const existing = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'WEEZEVENT' },
            select: { id: true },
        });
        if (!existing) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }

        const data: any = {};
        if (dto.name !== undefined) data.name = dto.name.trim();
        if (dto.enabled !== undefined) data.enabled = dto.enabled;

        const configData: any = {};
        if (dto.clientId !== undefined) configData.clientId = dto.clientId.trim();
        if (dto.clientSecret) {
            configData.clientSecret = this.encryptionService.encrypt(dto.clientSecret);
        }
        if (dto.organizationId !== undefined) {
            configData.organizationId = dto.organizationId?.trim() || null;
        }
        if (Object.keys(configData).length > 0) {
            // upsert : répare une intégration historique dont la ligne de config manquerait
            data.weezevent = {
                upsert: {
                    create: {
                        clientId: configData.clientId ?? '',
                        clientSecret: configData.clientSecret ?? '',
                        organizationId: configData.organizationId ?? null,
                    },
                    update: configData,
                },
            };
        }

        const updated = await this.prisma.integration.update({
            where: { id: instanceId },
            data,
            select: INSTANCE_SELECT,
        });

        await this.mirrorActiveInstanceToTenant(tenantId);
        return this.toPublicInstance(updated);
    }

    async deleteInstance(tenantId: string, instanceId: string): Promise<{ success: true }> {
        const existing = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'WEEZEVENT' },
            select: { id: true },
        });
        if (!existing) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }

        await this.prisma.integration.delete({ where: { id: instanceId } });
        await this.mirrorActiveInstanceToTenant(tenantId);
        return { success: true };
    }

    // ==================== BUG-106 : webhook secret par instance ====================

    async getWebhookConfig(
        tenantId: string,
        instanceId: string,
    ): Promise<{ enabled: boolean; configured: boolean }> {
        const row = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'WEEZEVENT' },
            select: { weezevent: { select: { webhookEnabled: true, webhookSecret: true } } },
        });
        if (!row) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }
        return {
            enabled: row.weezevent?.webhookEnabled ?? false,
            configured: !!row.weezevent?.webhookSecret,
        };
    }

    async updateWebhookConfig(
        tenantId: string,
        instanceId: string,
        dto: UpdateWeezeventWebhookDto,
    ): Promise<{ enabled: boolean; configured: boolean }> {
        const existing = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'WEEZEVENT' },
            select: { id: true },
        });
        if (!existing) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }

        const configData: any = {};
        if (dto.webhookSecret) {
            configData.webhookSecret = this.encryptionService.encrypt(dto.webhookSecret);
        }
        if (dto.webhookEnabled !== undefined) {
            configData.webhookEnabled = dto.webhookEnabled;
        }

        await this.prisma.integration.update({
            where: { id: instanceId },
            data: {
                // upsert : répare une intégration historique dont la ligne de config manquerait
                // (même garde que updateInstance() pour clientId/clientSecret)
                weezevent: {
                    upsert: {
                        create: {
                            clientId: '',
                            clientSecret: '',
                            webhookSecret: configData.webhookSecret ?? null,
                            webhookEnabled: configData.webhookEnabled ?? false,
                        },
                        update: configData,
                    },
                },
            },
        });

        return this.getWebhookConfig(tenantId, instanceId);
    }

    /**
     * Mirror the first enabled instance back to Tenant.weezevent* columns so the
     * existing sync/cron/webhook services (which read these columns) keep working.
     */
    private async mirrorActiveInstanceToTenant(tenantId: string): Promise<void> {
        const active = await this.prisma.integration.findFirst({
            where: { tenantId, provider: 'WEEZEVENT', enabled: true },
            orderBy: { createdAt: 'asc' },
            select: { weezevent: true },
        });

        if (active?.weezevent) {
            await this.prisma.tenant.update({
                where: { id: tenantId },
                data: {
                    weezeventClientId: active.weezevent.clientId,
                    weezeventClientSecret: active.weezevent.clientSecret, // already encrypted
                    weezeventOrganizationId: active.weezevent.organizationId,
                    weezeventEnabled: true,
                },
            });
        } else {
            await this.prisma.tenant.update({
                where: { id: tenantId },
                data: {
                    weezeventClientId: null,
                    weezeventClientSecret: null,
                    weezeventOrganizationId: null,
                    weezeventEnabled: false,
                },
            });
        }
    }

    private async assertTenant(tenantId: string): Promise<void> {
        const org = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true },
        });
        if (!org) {
            throw new NotFoundException(`Organization ${tenantId} not found`);
        }
    }

    // ==================== Legacy single-config API (back-compat) ====================

    async updateConfig(tenantId: string, config: WeezeventConfigDto) {
        await this.assertTenant(tenantId);

        // Toggle-off case: just disable all instances
        if (
            config.weezeventEnabled === false &&
            !config.weezeventClientId &&
            !config.weezeventClientSecret
        ) {
            await this.prisma.integration.updateMany({
                where: { tenantId, provider: 'WEEZEVENT' },
                data: { enabled: false },
            });
            await this.mirrorActiveInstanceToTenant(tenantId);
            return this.getConfig(tenantId);
        }

        const primary = await this.prisma.integration.findFirst({
            where: { tenantId, provider: 'WEEZEVENT' },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
        });

        if (primary) {
            const configData: any = {};
            if (config.weezeventClientId !== undefined) configData.clientId = config.weezeventClientId;
            if (config.weezeventClientSecret) {
                configData.clientSecret = this.encryptionService.encrypt(config.weezeventClientSecret);
            }
            if (config.weezeventOrganizationId !== undefined) {
                configData.organizationId = config.weezeventOrganizationId || null;
            }

            const data: any = {};
            if (config.weezeventEnabled !== undefined) data.enabled = config.weezeventEnabled;
            if (Object.keys(configData).length > 0) {
                data.weezevent = {
                    upsert: {
                        create: {
                            clientId: configData.clientId ?? '',
                            clientSecret: configData.clientSecret ?? '',
                            organizationId: configData.organizationId ?? null,
                        },
                        update: configData,
                    },
                };
            }

            await this.prisma.integration.update({
                where: { id: primary.id },
                data,
            });
        } else {
            if (!config.weezeventClientId || !config.weezeventClientSecret) {
                throw new BadRequestException(
                    'Client ID and Client Secret are required to create a Weezevent integration',
                );
            }
            await this.prisma.integration.create({
                data: {
                    tenantId,
                    provider: 'WEEZEVENT',
                    name: 'Weezevent',
                    enabled: config.weezeventEnabled ?? true,
                    weezevent: {
                        create: {
                            clientId: config.weezeventClientId,
                            clientSecret: this.encryptionService.encrypt(config.weezeventClientSecret),
                            organizationId: config.weezeventOrganizationId || null,
                        },
                    },
                },
            });
        }

        await this.mirrorActiveInstanceToTenant(tenantId);
        return this.getConfig(tenantId);
    }

    async getConfig(tenantId: string) {
        await this.assertTenant(tenantId);

        const primary =
            (await this.prisma.integration.findFirst({
                where: { tenantId, provider: 'WEEZEVENT', enabled: true },
                orderBy: { createdAt: 'asc' },
                select: { enabled: true, weezevent: { select: { clientId: true, organizationId: true } } },
            })) ??
            (await this.prisma.integration.findFirst({
                where: { tenantId, provider: 'WEEZEVENT' },
                orderBy: { createdAt: 'asc' },
                select: { enabled: true, weezevent: { select: { clientId: true, organizationId: true } } },
            }));

        if (primary) {
            return {
                clientId: primary.weezevent?.clientId ?? null,
                organizationId: primary.weezevent?.organizationId ?? null,
                enabled: primary.enabled,
                configured: !!primary.weezevent?.clientId,
            };
        }

        // Fallback to legacy tenant columns (e.g. mid-migration)
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                weezeventClientId: true,
                weezeventOrganizationId: true,
                weezeventEnabled: true,
            },
        });

        return {
            clientId: tenant?.weezeventClientId ?? null,
            organizationId: tenant?.weezeventOrganizationId ?? null,
            enabled: tenant?.weezeventEnabled ?? false,
            configured: !!tenant?.weezeventClientId,
        };
    }
}
