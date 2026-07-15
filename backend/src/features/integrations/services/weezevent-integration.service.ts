import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';
import { WeezeventConfigDto } from '../dto/weezevent-config.dto';
import {
    CreateWeezeventInstanceDto,
    UpdateWeezeventInstanceDto,
} from '../dto/weezevent-instance.dto';

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

    // ==================== Multi-instance API ====================

    async listInstances(tenantId: string): Promise<PublicInstance[]> {
        await this.assertTenant(tenantId);
        const rows = await this.prisma.integration.findMany({
            where: { tenantId, provider: 'WEEZEVENT' },
            orderBy: { createdAt: 'asc' },
            select: INSTANCE_SELECT,
        });
        return rows.map((row) => this.toPublicInstance(row));
    }

    async getInstance(tenantId: string, instanceId: string): Promise<PublicInstance> {
        const row = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'WEEZEVENT' },
            select: INSTANCE_SELECT,
        });
        if (!row) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
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
