import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { POS_INTEGRATION_NAME, POS_MAPPED_BY } from '../pos.contracts';

export interface PosEventInput {
    id: string;
    name: string;
    eventDate: Date;
    eventStartDate?: Date | null;
    eventEndDate?: Date | null;
    configurationId?: string | null;
}

export interface PosElementInput {
    id: string;
    name: string;
    type?: string | null;
}

export interface PosMenuItemInput {
    id: string;
    name: string;
    basePrice?: Prisma.Decimal | number | string | null;
    vatRate?: Prisma.Decimal | number | string | null;
}

export interface PosReferentials {
    integrationId: string;
    salesEventId: string;
    locationIdByElementId: Map<string, string>;
    productIdByMenuItemId: Map<string, string>;
}

/**
 * Référentiels de ventes de la source POS (lot L1) : Integration (une par espace), SalesEvent, SalesLocation,
 * SalesProduct et leurs mappings, créés à la demande et toujours idempotents.
 *
 * Appelé aussi depuis des routes invité @Public où le scoping Prisma par tenant (CLS) est
 * inactif : `tenantId` est donc toujours un paramètre explicite, jamais déduit du contexte.
 * Aucune requête sur les tables de transactions.
 */
@Injectable()
export class PosSourceService {
    private readonly logger = new Logger(PosSourceService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Une Integration POS PAR ESPACE (tenant, espace). Le rattachement espace <-> intégration est
     * un LocationSpaceMapping dont `salesLocationId` porte l'ID d'intégration. Création de
     * l'intégration et du mapping dans une seule transaction protégée par un verrou advisory de
     * TRANSACTION (jamais de verrou de session derrière le pooleur) : deux démarrages simultanés
     * ne créent qu'une intégration. Une intégration désactivée est réactivée.
     */
    async ensureIntegrationForSpace(tenantId: string, spaceId: string): Promise<string> {
        const found = await this.findSpaceIntegration(this.prisma, tenantId, spaceId);
        if (found?.enabled) return found.id;

        return this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-integration:${tenantId}:${spaceId}`}))`;
            const current = await this.findSpaceIntegration(tx, tenantId, spaceId);
            if (current) {
                if (!current.enabled) {
                    await tx.integration.update({ where: { id: current.id }, data: { enabled: true } });
                }
                return current.id;
            }
            const space = await tx.space.findFirst({ where: { id: spaceId, tenantId }, select: { name: true } });
            if (!space) throw new NotFoundException(`Espace ${spaceId} introuvable`);
            const created = await tx.integration.create({
                data: { tenantId, provider: 'POS', name: `${POS_INTEGRATION_NAME} · ${space.name}`, enabled: true },
                select: { id: true },
            });
            await tx.locationSpaceMapping.create({
                data: { tenantId, salesLocationId: created.id, spaceId },
            });
            return created.id;
        });
    }

    /** Intégration POS déjà rattachée à l'espace (mapping espace puis filtre provider POS). */
    private async findSpaceIntegration(
        client: Pick<PrismaService, 'locationSpaceMapping' | 'integration'>,
        tenantId: string,
        spaceId: string,
    ): Promise<{ id: string; enabled: boolean } | null> {
        const mappings = await client.locationSpaceMapping.findMany({
            where: { tenantId, spaceId },
            select: { salesLocationId: true },
        });
        if (mappings.length === 0) return null;
        return client.integration.findFirst({
            where: { tenantId, provider: 'POS', id: { in: mappings.map((m) => m.salesLocationId) } },
            orderBy: { createdAt: 'asc' },
            select: { id: true, enabled: true },
        });
    }

    /** SalesEvent POS de l'évènement Data Friday (externalId = Event.id). */
    async ensureSalesEvent(tenantId: string, integrationId: string, event: PosEventInput): Promise<string> {
        const startDate = event.eventStartDate ?? event.eventDate;
        const endDate = event.eventEndDate ?? null;
        const row = await this.prisma.salesEvent.upsert({
            where: { tenantId_integrationId_externalId: { tenantId, integrationId, externalId: event.id } },
            create: {
                externalId: event.id,
                tenantId,
                integrationId,
                name: event.name,
                organizationId: tenantId,
                startDate,
                endDate,
                configurationId: event.configurationId ?? null,
                metadata: { provider: 'pos', eventId: event.id },
                rawData: { pos: true, eventId: event.id },
                syncedAt: new Date(),
            },
            update: {
                name: event.name,
                startDate,
                endDate,
                ...(event.configurationId ? { configurationId: event.configurationId } : {}),
                syncedAt: new Date(),
            },
            select: { id: true },
        });
        return row.id;
    }

    /** SalesLocation POS par PdV (externalId = SpaceElement.id) + LocationShopMapping vers ce PdV. */
    async ensureLocations(
        tenantId: string,
        integrationId: string,
        spaceId: string,
        elements: PosElementInput[],
    ): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        if (elements.length === 0) return result;
        const externalIds = elements.map((e) => e.id);
        const where = { tenantId, integrationId, externalId: { in: externalIds } };

        let rows = await this.prisma.salesLocation.findMany({ where, select: { id: true, externalId: true, name: true } });
        const known = new Set(rows.map((r) => r.externalId));
        const missing = elements.filter((e) => !known.has(e.id));
        if (missing.length > 0) {
            await this.prisma.salesLocation.createMany({
                data: missing.map((e) => ({
                    externalId: e.id,
                    tenantId,
                    integrationId,
                    provider: 'POS' as const,
                    name: e.name,
                    type: e.type ?? null,
                    metadata: { provider: 'pos', spaceId },
                    rawData: { pos: true, elementId: e.id },
                    syncedAt: new Date(),
                })),
                skipDuplicates: true,
            });
            rows = await this.prisma.salesLocation.findMany({ where, select: { id: true, externalId: true, name: true } });
        }

        // Renommage d'un PdV : seulement les noms qui ont changé.
        const nameByElementId = new Map(elements.map((e) => [e.id, e.name]));
        const renamed = rows.filter((r) => known.has(r.externalId) && nameByElementId.get(r.externalId) !== r.name);
        await Promise.all(
            renamed.map((r) =>
                this.prisma.salesLocation.update({ where: { id: r.id }, data: { name: nameByElementId.get(r.externalId)! } }),
            ),
        );

        for (const r of rows) result.set(r.externalId, r.id);
        await this.prisma.locationShopMapping.createMany({
            data: rows.map((r) => ({ tenantId, salesLocationId: r.id, spaceElementId: r.externalId })),
            skipDuplicates: true,
        });
        return result;
    }

    /**
     * SalesProduct POS par menu item (externalId = MenuItem.id) + ProductMapping auto. Un mapping
     * existant (posé à la main ou par une passe précédente) n'est jamais écrasé.
     */
    async ensureProducts(
        tenantId: string,
        integrationId: string,
        menuItems: PosMenuItemInput[],
    ): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        if (menuItems.length === 0) return result;
        const where = { tenantId, integrationId, externalId: { in: menuItems.map((m) => m.id) } };

        let rows = await this.prisma.salesProduct.findMany({ where, select: { id: true, externalId: true, name: true } });
        const known = new Set(rows.map((r) => r.externalId));
        const missing = menuItems.filter((m) => !known.has(m.id));
        if (missing.length > 0) {
            await this.prisma.salesProduct.createMany({
                data: missing.map((m) => ({
                    externalId: m.id,
                    tenantId,
                    integrationId,
                    provider: 'POS' as const,
                    name: m.name,
                    basePrice: m.basePrice != null ? new Prisma.Decimal(m.basePrice) : null,
                    vatRate: m.vatRate != null ? new Prisma.Decimal(m.vatRate) : null,
                    allergens: [],
                    metadata: { provider: 'pos' },
                    rawData: { pos: true, menuItemId: m.id },
                    syncedAt: new Date(),
                })),
                skipDuplicates: true,
            });
            rows = await this.prisma.salesProduct.findMany({ where, select: { id: true, externalId: true, name: true } });
        }

        const nameByMenuItemId = new Map(menuItems.map((m) => [m.id, m.name]));
        const renamed = rows.filter((r) => known.has(r.externalId) && nameByMenuItemId.get(r.externalId) !== r.name);
        await Promise.all(
            renamed.map((r) =>
                this.prisma.salesProduct.update({ where: { id: r.id }, data: { name: nameByMenuItemId.get(r.externalId)! } }),
            ),
        );

        for (const r of rows) result.set(r.externalId, r.id);
        // @@unique([salesProductId]) : skipDuplicates laisse intact tout mapping déjà posé.
        await this.prisma.productMapping.createMany({
            data: rows.map((r) => ({
                tenantId,
                salesProductId: r.id,
                menuItemId: r.externalId,
                autoMapped: true,
                confidence: 1,
                mappedBy: POS_MAPPED_BY,
            })),
            skipDuplicates: true,
        });
        return result;
    }

    /**
     * Garantit tous les référentiels POS d'un évènement. `elementIds` et `menuItemIds` sont ceux du
     * PdV (ou des PdV) démarré(s) ; l'appelant a déjà vérifié leur appartenance à la config de
     * l'évènement. L'évènement est relu avec (tenantId, spaceId) pour borner le périmètre.
     */
    async ensureReferentials(
        tenantId: string,
        spaceId: string,
        eventId: string,
        elementIds: string[],
        menuItemIds: string[],
    ): Promise<PosReferentials> {
        const event = await this.prisma.event.findFirst({
            where: { id: eventId, tenantId, spaceId },
            select: { id: true, name: true, eventDate: true, eventStartDate: true, eventEndDate: true, configurationId: true },
        });
        if (!event) throw new NotFoundException(`Évènement ${eventId} introuvable pour l'espace ${spaceId}`);

        const [elements, menuItems] = await Promise.all([
            elementIds.length
                ? this.prisma.spaceElement.findMany({ where: { id: { in: [...new Set(elementIds)] } }, select: { id: true, name: true, type: true } })
                : Promise.resolve([]),
            menuItemIds.length
                ? this.prisma.menuItem.findMany({
                    where: { id: { in: [...new Set(menuItemIds)] }, tenantId },
                    select: { id: true, name: true, basePrice: true, vatRate: true },
                })
                : Promise.resolve([]),
        ]);

        const integrationId = await this.ensureIntegrationForSpace(tenantId, spaceId);
        const salesEventId = await this.ensureSalesEvent(tenantId, integrationId, event);
        const locationIdByElementId = await this.ensureLocations(tenantId, integrationId, spaceId, elements);
        const productIdByMenuItemId = await this.ensureProducts(tenantId, integrationId, menuItems);
        return { integrationId, salesEventId, locationIdByElementId, productIdByMenuItemId };
    }
}
