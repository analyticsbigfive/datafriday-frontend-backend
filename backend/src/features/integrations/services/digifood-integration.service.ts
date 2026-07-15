import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';
import {
    CreateDigifoodInstanceDto,
    UpdateDigifoodInstanceDto,
} from '../dto/digifood-instance.dto';

type PublicDigifoodInstance = {
    id: string;
    name: string;
    enabled: boolean;
    provider: 'DIGIFOOD';
    /** Secret masqué : •••• + 4 derniers caractères — jamais renvoyé en clair */
    webhookSecretMasked: string | null;
    keyVersion: string | null;
    posVersion: string | null;
    /** URL à communiquer à Digifood pour le provisioning du webhook */
    webhookUrl: string;
    createdAt: Date;
    updatedAt: Date;
};

const INSTANCE_SELECT = {
    id: true,
    tenantId: true,
    name: true,
    enabled: true,
    createdAt: true,
    updatedAt: true,
    digifood: { select: { webhookSecret: true, keyVersion: true, posVersion: true } },
} as const;

/**
 * CRUD des intégrations Digifood (PLAN_INTEGRATION_DIGIFOOD §8) :
 * Integration(provider=DIGIFOOD) + détail 1-1 DigifoodIntegrationConfig.
 * Pas d'API Digifood à appeler : le « test » vérifie qu'au moins un webhook
 * signé a été reçu (dernier IntegrationWebhookEvent de l'intégration).
 */
@Injectable()
export class DigifoodIntegrationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryption: EncryptionService,
        private readonly config: ConfigService,
    ) { }

    /** {API_PUBLIC_URL}/webhooks/digifood/{tenantId}/{integrationId} — chemin relatif si l'env n'est pas posée */
    private webhookUrl(tenantId: string, integrationId: string): string {
        const base = (this.config.get<string>('API_PUBLIC_URL') ?? '').replace(/\/+$/, '');
        return `${base}/webhooks/digifood/${tenantId}/${integrationId}`;
    }

    private maskSecret(encrypted: string | null | undefined): string | null {
        if (!encrypted) return null;
        try {
            const plain = this.encryption.decrypt(encrypted);
            return `••••${plain.slice(-4)}`;
        } catch {
            return '••••';
        }
    }

    private toPublic(row: {
        id: string;
        tenantId: string;
        name: string;
        enabled: boolean;
        createdAt: Date;
        updatedAt: Date;
        digifood: { webhookSecret: string; keyVersion: string | null; posVersion: string | null } | null;
    }): PublicDigifoodInstance {
        return {
            id: row.id,
            name: row.name,
            enabled: row.enabled,
            provider: 'DIGIFOOD',
            webhookSecretMasked: this.maskSecret(row.digifood?.webhookSecret),
            keyVersion: row.digifood?.keyVersion ?? null,
            posVersion: row.digifood?.posVersion ?? null,
            webhookUrl: this.webhookUrl(row.tenantId, row.id),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    async listInstances(tenantId: string): Promise<PublicDigifoodInstance[]> {
        const rows = await this.prisma.integration.findMany({
            where: { tenantId, provider: 'DIGIFOOD' },
            orderBy: { createdAt: 'asc' },
            select: INSTANCE_SELECT,
        });
        return rows.map((row) => this.toPublic(row));
    }

    async getInstance(tenantId: string, instanceId: string): Promise<PublicDigifoodInstance> {
        const row = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'DIGIFOOD' },
            select: INSTANCE_SELECT,
        });
        if (!row) throw new NotFoundException(`Digifood instance ${instanceId} not found`);
        return this.toPublic(row);
    }

    async createInstance(
        tenantId: string,
        dto: CreateDigifoodInstanceDto,
    ): Promise<PublicDigifoodInstance> {
        const created = await this.prisma.integration.create({
            data: {
                tenantId,
                provider: 'DIGIFOOD',
                name: dto.name.trim(),
                enabled: dto.enabled ?? true,
                digifood: {
                    create: { webhookSecret: this.encryption.encrypt(dto.webhookSecret) },
                },
            },
            select: INSTANCE_SELECT,
        });
        return this.toPublic(created);
    }

    async updateInstance(
        tenantId: string,
        instanceId: string,
        dto: UpdateDigifoodInstanceDto,
    ): Promise<PublicDigifoodInstance> {
        const existing = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'DIGIFOOD' },
            select: { id: true },
        });
        if (!existing) throw new NotFoundException(`Digifood instance ${instanceId} not found`);

        const data: any = {};
        if (dto.name !== undefined) data.name = dto.name.trim();
        if (dto.enabled !== undefined) data.enabled = dto.enabled;
        if (dto.webhookSecret) {
            const encrypted = this.encryption.encrypt(dto.webhookSecret);
            // upsert : répare une intégration dont la ligne de config manquerait
            data.digifood = {
                upsert: {
                    create: { webhookSecret: encrypted },
                    update: { webhookSecret: encrypted, keyVersion: null },
                },
            };
        }

        const updated = await this.prisma.integration.update({
            where: { id: instanceId },
            data,
            select: INSTANCE_SELECT,
        });
        return this.toPublic(updated);
    }

    async deleteInstance(tenantId: string, instanceId: string): Promise<{ success: true }> {
        const existing = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'DIGIFOOD' },
            select: { id: true },
        });
        if (!existing) throw new NotFoundException(`Digifood instance ${instanceId} not found`);
        await this.prisma.integration.delete({ where: { id: instanceId } });
        return { success: true };
    }

    /**
     * « Test » : pas d'API à pinger — retourne le dernier webhook reçu (signé avec
     * succès puisque journalisé) et son statut de traitement.
     */
    async testInstance(tenantId: string, instanceId: string) {
        await this.getInstance(tenantId, instanceId); // 404 si absente / mauvais tenant
        const last = await this.prisma.integrationWebhookEvent.findFirst({
            where: { tenantId, integrationId: instanceId, provider: 'DIGIFOOD' },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                eventType: true,
                method: true,
                createdAt: true,
                processed: true,
                processedAt: true,
                error: true,
                retryCount: true,
            },
        });
        return {
            configured: true,
            webhookUrl: this.webhookUrl(tenantId, instanceId),
            lastWebhook: last ?? null,
            message: last
                ? `Dernier webhook reçu le ${last.createdAt.toISOString()} (${last.processed ? 'traité' : last.error ? 'en erreur' : 'en attente'})`
                : 'Aucun webhook reçu pour cette intégration — vérifier le provisioning côté Digifood.',
        };
    }
}
