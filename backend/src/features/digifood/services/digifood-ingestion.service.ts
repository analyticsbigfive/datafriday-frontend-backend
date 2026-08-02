import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { NormalizedOrder } from './digifood-order-normalizer';

export type DigifoodIngestSource = 'webhook' | 'csv';

export interface IngestResult {
    transactionId: string;
    created: boolean;
    skippedDuplicateRefund: boolean;
    itemsCount: number;
    productsUpserted: number;
    autoMapped: number;
}

/**
 * Ingestion Digifood → source commune de ventes (PLAN_INTEGRATION_DIGIFOOD §5).
 * Point d'entrée unique `ingestOrder` utilisé par le webhook ET l'import CSV.
 * Tout est upsert-idempotent (retries Digifood 24 h, réimports CSV).
 * ⚠️ Appelé hors contexte requête authentifiée (@Public) : le scoping Prisma CLS
 * est inactif → toutes les écritures portent tenantId EXPLICITEMENT.
 */
@Injectable()
export class DigifoodIngestionService {
    private readonly logger = new Logger(DigifoodIngestionService.name);

    constructor(private readonly prisma: PrismaService) { }

    async ingestOrder(
        tenantId: string,
        integrationId: string,
        order: NormalizedOrder,
        source: DigifoodIngestSource,
    ): Promise<IngestResult> {
        // ── Garde anti-double-comptage v24/v26 (§5.1) ────────────────────────────
        if (order.type === 'refund' && (await this.isDuplicateRefund(tenantId, integrationId, order))) {
            this.logger.warn(
                `Refund ${order.id} ignoré : un remboursement équivalent (order d'origine ${order.originalOrderId}, montant ${order.total}) existe déjà (double émission v24/v26 probable)`,
            );
            return {
                transactionId: order.id,
                created: false,
                skippedDuplicateRefund: true,
                itemsCount: 0,
                productsUpserted: 0,
                autoMapped: 0,
            };
        }

        // ── Référentiels à la volée (§5.2) : site → PDV → produits ──────────────
        const salesEvent = await this.upsertSiteAsEvent(tenantId, integrationId, order);
        const salesLocation = await this.upsertShopAsLocation(tenantId, integrationId, order);
        const { productIdByKey, autoMapped } = await this.upsertProducts(tenantId, integrationId, order);

        // ── Transaction + items en UNE seule $transaction (§5.5) ────────────────
        const externalId = order.id;
        const metadata = {
            provider: 'digifood',
            source,
            type: order.type,
            medium: order.medium,
            shortId: order.shortId,
            sessionId: order.sessionId,
            cashier: order.cashier,
            payments: order.payments,
            discounts: order.discounts,
            relationships: order.relationships,
            beforeDiscounts: order.beforeDiscounts,
            softwareVersion: order.softwareVersion,
            ...(order.originalOrderId ? { originalOrderId: order.originalOrderId } : {}),
        };

        const itemsData = order.items.map((item) => ({
            externalItemId: item.id,
            productId: productIdByKey.get(item.productKey) ?? null,
            productName: item.variation && item.variation !== item.name
                ? `${item.name} — ${item.variation}`
                : item.name,
            // Plus de Math.trunc : quantity est Float en base — les ventes au poids
            // et formules à ratio ne perdent plus leurs décimales (= du CA).
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice.toFixed(2)),
            vat: new Prisma.Decimal(item.vatRate.toFixed(2)),
            // price_pu Digifood est déjà APRÈS remise → reduction 0 (les agrégats font
            // unitPrice*qty − reduction) ; les montants avant remise restent en metadata.
            reduction: new Prisma.Decimal(0),
            rawData: { ...item.raw, parentItemId: item.parentItemId, depth: item.depth } as Prisma.InputJsonValue,
        }));

        const [transaction, existedBefore] = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.salesTransaction.findUnique({
                where: { tenantId_integrationId_externalId: { tenantId, integrationId, externalId } },
                select: { id: true },
            });

            const row = await tx.salesTransaction.upsert({
                where: { tenantId_integrationId_externalId: { tenantId, integrationId, externalId } },
                create: {
                    externalId,
                    tenantId,
                    integrationId,
                    provider: 'DIGIFOOD',
                    amount: new Prisma.Decimal(order.total.toFixed(2)),
                    // Convention aval : seules les transactions status='V' sont consommées
                    // (revenus, stock). Les refunds passent en 'V' avec montants négatifs.
                    status: 'V',
                    transactionDate: order.placedAt,
                    eventId: salesEvent?.id ?? null,
                    eventName: order.location?.name ?? null,
                    locationId: salesLocation?.id ?? null,
                    locationName: order.shop?.name ?? null,
                    metadata: metadata as Prisma.InputJsonValue,
                    rawData: order.raw as Prisma.InputJsonValue,
                    syncedAt: new Date(),
                },
                update: {
                    amount: new Prisma.Decimal(order.total.toFixed(2)),
                    transactionDate: order.placedAt,
                    eventId: salesEvent?.id ?? null,
                    eventName: order.location?.name ?? null,
                    locationId: salesLocation?.id ?? null,
                    locationName: order.shop?.name ?? null,
                    metadata: metadata as Prisma.InputJsonValue,
                    rawData: order.raw as Prisma.InputJsonValue,
                    syncedAt: new Date(),
                },
                select: { id: true },
            });

            // Même patron que upsertTransactionItems Weezevent : delete + createMany
            // (gère aussi la ré-émission d'un order v24 mutable, question ouverte §9.7)
            await tx.salesTransactionItem.deleteMany({ where: { transactionId: row.id } });
            if (itemsData.length > 0) {
                await tx.salesTransactionItem.createMany({
                    data: itemsData.map((d) => ({ ...d, transactionId: row.id })),
                });
            }

            return [row, !!existing] as const;
        });

        this.logger.log(
            `Digifood ${source} ${order.type} ${externalId} ${existedBefore ? 'mis à jour' : 'créé'} — ${itemsData.length} ligne(s), total ${order.total}€, tenant ${tenantId}`,
        );

        return {
            transactionId: transaction.id,
            created: !existedBefore,
            skippedDuplicateRefund: false,
            itemsCount: itemsData.length,
            productsUpserted: productIdByKey.size,
            autoMapped,
        };
    }

    /**
     * §5.1 — neutralise la 2ᵉ écriture d'un même remboursement quand un client migre
     * v24→v26 et que Digifood émet les deux webhooks :
     *  - avant d'insérer un pseudo-ordre v24 `refund:*` : existe-t-il un ticket v26
     *    type=refund pointant le même order d'origine au même montant ?
     *  - avant d'insérer un ticket v26 type=refund : existe-t-il le pseudo-ordre v24 ?
     * Les candidats sont bornés par (tenant, intégration, provider, montant) puis le
     * lien d'origine est vérifié en JS (filtre JSON portable et lisible).
     */
    private async isDuplicateRefund(
        tenantId: string,
        integrationId: string,
        order: NormalizedOrder,
    ): Promise<boolean> {
        if (!order.originalOrderId) return false;
        const candidates = await this.prisma.salesTransaction.findMany({
            where: {
                tenantId,
                integrationId,
                provider: 'DIGIFOOD',
                amount: new Prisma.Decimal(order.total.toFixed(2)),
                externalId: { not: order.id }, // le retry du MÊME webhook reste un upsert normal
            },
            select: { externalId: true, metadata: true },
            take: 50,
        });
        return candidates.some((c) => {
            const meta = (c.metadata ?? {}) as Record<string, unknown>;
            if (meta.provider !== 'digifood' || meta.type !== 'refund') return false;
            if (String(meta.originalOrderId ?? '') === order.originalOrderId) return true;
            const relationships = Array.isArray(meta.relationships) ? meta.relationships : [];
            return relationships.some(
                (r: Record<string, unknown>) =>
                    r && String(r.related_order_id ?? '') === order.originalOrderId,
            );
        });
    }

    /** §5.4 — le site Digifood (`location`) est projeté en SalesEvent (dimension événement/site). */
    private async upsertSiteAsEvent(
        tenantId: string,
        integrationId: string,
        order: NormalizedOrder,
    ): Promise<{ id: string } | null> {
        if (!order.location) return null;
        return this.prisma.salesEvent.upsert({
            where: {
                tenantId_integrationId_externalId: {
                    tenantId,
                    integrationId,
                    externalId: order.location.id,
                },
            },
            create: {
                externalId: order.location.id,
                tenantId,
                integrationId,
                name: order.location.name,
                organizationId: '',
                metadata: { provider: 'digifood' },
                rawData: { location: order.location },
                syncedAt: new Date(),
            },
            update: { name: order.location.name, syncedAt: new Date() },
            select: { id: true },
        });
    }

    /** §5.2.2 — le PDV Digifood (`shop`) est projeté en SalesLocation (mappée Space + SpaceElement au wizard). */
    private async upsertShopAsLocation(
        tenantId: string,
        integrationId: string,
        order: NormalizedOrder,
    ): Promise<{ id: string } | null> {
        if (!order.shop) return null;
        return this.prisma.salesLocation.upsert({
            where: {
                tenantId_integrationId_externalId: {
                    tenantId,
                    integrationId,
                    externalId: order.shop.id,
                },
            },
            create: {
                externalId: order.shop.id,
                tenantId,
                integrationId,
                provider: 'DIGIFOOD',
                name: order.shop.name,
                metadata: {
                    provider: 'digifood',
                    digifoodLocationId: order.location?.id ?? null,
                    digifoodLocationName: order.location?.name ?? null,
                },
                rawData: { shop: order.shop, location: order.location },
                syncedAt: new Date(),
            },
            update: { name: order.shop.name, syncedAt: new Date() },
            select: { id: true },
        });
    }

    /**
     * §5.2.3 — upsert du catalogue à la volée (pas d'API catalogue Digifood) :
     * une ligne SalesProduct par productKey ; nom/prix rafraîchis à chaque vente
     * (dernier vu = état courant, comme le sync catalogue Weezevent).
     * Retourne la map productKey → SalesProduct.id + le compteur d'auto-mappings (§6).
     */
    private async upsertProducts(
        tenantId: string,
        integrationId: string,
        order: NormalizedOrder,
    ): Promise<{ productIdByKey: Map<string, string>; autoMapped: number }> {
        const productIdByKey = new Map<string, string>();
        let autoMapped = 0;

        // Dédup par clé produit (une formule répétée n'upserte qu'une fois) ;
        // séquentiel : upserts sur la même table, volumes faibles (lignes d'un ticket).
        const byKey = new Map<string, NormalizedOrder['items'][number]>();
        for (const item of order.items) {
            if (!byKey.has(item.productKey)) byKey.set(item.productKey, item);
        }

        for (const [key, item] of byKey) {
            const displayName = item.variation && item.variation !== item.name
                ? `${item.name} — ${item.variation}`
                : item.name;
            const product = await this.prisma.salesProduct.upsert({
                where: {
                    tenantId_integrationId_externalId: { tenantId, integrationId, externalId: key },
                },
                create: {
                    externalId: key,
                    tenantId,
                    integrationId,
                    provider: 'DIGIFOOD',
                    name: displayName,
                    productType: item.family,
                    basePrice: new Prisma.Decimal(Math.abs(item.unitPrice).toFixed(2)),
                    vatRate: new Prisma.Decimal(item.vatRate.toFixed(2)),
                    metadata: {
                        provider: 'digifood',
                        externalReference: item.externalReference,
                        namePrivate: item.namePrivate,
                        barcode: item.barcode,
                    },
                    rawData: item.raw as Prisma.InputJsonValue,
                    syncedAt: new Date(),
                },
                update: {
                    name: displayName,
                    productType: item.family,
                    // pas de rafraîchissement du prix depuis une ligne de refund
                    ...(item.quantity >= 0
                        ? {
                            basePrice: new Prisma.Decimal(Math.abs(item.unitPrice).toFixed(2)),
                            vatRate: new Prisma.Decimal(item.vatRate.toFixed(2)),
                        }
                        : {}),
                    metadata: {
                        provider: 'digifood',
                        externalReference: item.externalReference,
                        namePrivate: item.namePrivate,
                        barcode: item.barcode,
                    },
                    rawData: item.raw as Prisma.InputJsonValue,
                    syncedAt: new Date(),
                },
                select: { id: true },
            });
            productIdByKey.set(key, product.id);

            if (item.externalReference) {
                autoMapped += (await this.tryAutoMapProduct(tenantId, product.id, item.externalReference))
                    ? 1
                    : 0;
            }
        }

        return { productIdByKey, autoMapped };
    }

    /**
     * §6 — auto-mapping produit→MenuItem via external_reference :
     * mapping créé UNIQUEMENT si aucun mapping n'existe pour ce produit et si la
     * référence matche exactement 1 MenuItem du tenant (id exact ou nom insensible
     * à la casse). 0 ou plusieurs matches → on ne fait rien, le wizard tranchera.
     */
    private async tryAutoMapProduct(
        tenantId: string,
        salesProductId: string,
        externalReference: string,
    ): Promise<boolean> {
        const existing = await this.prisma.productMapping.findUnique({
            where: { salesProductId },
            select: { id: true },
        });
        if (existing) return false;

        const matches = await this.prisma.menuItem.findMany({
            where: {
                tenantId,
                deletedAt: null,
                OR: [
                    { id: externalReference },
                    { name: { equals: externalReference, mode: 'insensitive' } },
                ],
            },
            select: { id: true },
            take: 2,
        });
        if (matches.length !== 1) return false;

        await this.prisma.productMapping.create({
            data: {
                tenantId,
                salesProductId,
                menuItemId: matches[0].id,
                autoMapped: true,
                confidence: 1.0,
                mappedBy: 'digifood:external_reference',
            },
        });
        this.logger.log(
            `Auto-mapping Digifood : produit ${salesProductId} → menu item ${matches[0].id} (external_reference="${externalReference}")`,
        );
        return true;
    }
}
