import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { MapProductToMenuItemDto } from '../../dto/map-product-to-menu-item.dto';
import { MenuItemPricingService } from '../../../../shared/pricing/menu-item-pricing.service';
import { orphanTransactionItems } from '../../weezevent-data.queries';
import { WeezeventBackfillTransactionItemProductsQueryDto, WeezeventGetProductMappingsQueryDto } from '../../dto/weezevent.query.dto';

/**
 * Rattachement des produits Weezevent aux articles du menu, et rattrapage des lignes de vente sans produit.
 */
@Injectable()
export class WeezeventProductMappingAdminService {
    private readonly logger = new Logger(WeezeventProductMappingAdminService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly pricing: MenuItemPricingService,
    ) { }

    /**
     * BACKFILL : relie les ventes orphelines à leur produit — et CRÉE le produit s'il manque.
     *
     * Problème : `WeezeventTransactionItem.productId` peut être null (le sync n'a pas résolu le
     * produit au moment d'insérer la ligne). Ces ventes sont alors INVISIBLES à toute dérivation de
     * prix (qui filtre par productId) → prix à 0 même quand des ventes existent. Et si le produit
     * n'a jamais été créé, il n'apparaît même pas à l'étape 3 pour être mappé.
     *
     * Ce backfill : pour chaque ligne orpheline, résout le produit par `rawData.item_id` →
     * `WeezeventProduct.weezeventId` (scopé à l'intégration de la transaction). S'il n'existe pas,
     * il le CRÉE (basePrice laissé null → le prix se dérive des ventes au read-time). Puis relie
     * toutes les lignes. `dryRun=true` → aperçu (compteurs) sans écriture.
     */
    async backfillTransactionItemProducts(user: any, params: WeezeventBackfillTransactionItemProductsQueryDto) {
        const { integrationId, dryRun } = params;
        const tenantId = user.tenantId;
        const preview = dryRun === 'true' || (dryRun as any) === true;
        const summary = {
            dryRun: preview,
            orphanItems: 0,
            distinctProducts: 0,
            productsCreated: 0,
            productsExisting: 0,
            itemsLinked: 0,
            skippedNoItemId: 0,
        };

        // 1. Lignes orphelines (productId null) + intégration de la transaction + item_id du produit.
        const orphans = await orphanTransactionItems(this.prisma, tenantId, integrationId);
        summary.orphanItems = orphans.length;
        if (orphans.length === 0) return summary;

        // 2. Regrouper par (intégration, item_id).
        const byKey = new Map<string, { integrationId: string; itemWid: string; name: string | null; itemIds: string[] }>();
        for (const o of orphans) {
            if (!o.itemWid || !o.integrationId) { summary.skippedNoItemId++; continue; }
            const key = `${o.integrationId}::${o.itemWid}`;
            const g = byKey.get(key) ?? { integrationId: o.integrationId, itemWid: o.itemWid, name: null, itemIds: [] };
            if (!g.name && o.productName) g.name = o.productName;
            g.itemIds.push(o.id);
            byKey.set(key, g);
        }
        summary.distinctProducts = byKey.size;

        // 3. Produits existants pour ces (intégration, item_id).
        const wids = [...new Set([...byKey.values()].map((g) => g.itemWid))];
        const existing = await this.prisma.salesProduct.findMany({
            where: { tenantId, externalId: { in: wids }, ...(integrationId ? { integrationId } : {}) },
            select: { id: true, integrationId: true, externalId: true },
        });
        const prodByKey = new Map(existing.map((p) => [`${p.integrationId}::${p.externalId}`, p.id]));

        // 4. Créer les produits manquants + relier les lignes.
        for (const [key, g] of byKey) {
            let productId = prodByKey.get(key);
            if (productId) {
                summary.productsExisting++;
            } else {
                summary.productsCreated++;
                if (!preview) {
                    const created = await this.prisma.salesProduct.upsert({
                        where: { tenantId_integrationId_externalId: { tenantId, integrationId: g.integrationId, externalId: g.itemWid } },
                        create: { externalId: g.itemWid, tenantId, integrationId: g.integrationId, name: g.name || `Item ${g.itemWid}`, rawData: {}, syncedAt: new Date() },
                        update: {},
                        select: { id: true },
                    });
                    productId = created.id;
                    prodByKey.set(key, productId);
                }
            }

            if (preview) {
                summary.itemsLinked += g.itemIds.length;
                continue;
            }
            if (!productId) continue;
            const CHUNK = 500;
            for (let i = 0; i < g.itemIds.length; i += CHUNK) {
                const slice = g.itemIds.slice(i, i + CHUNK);
                const r = await this.prisma.salesTransactionItem.updateMany({
                    where: { id: { in: slice } },
                    data: { productId },
                });
                summary.itemsLinked += r.count;
            }
        }

        this.logger.log(
            `Backfill transaction-item products${preview ? ' [DRY-RUN]' : ''} (tenant ${tenantId}${integrationId ? `, integration ${integrationId}` : ''}): ` +
                `${summary.itemsLinked} lignes reliées, ${summary.productsCreated} produits créés, ${summary.productsExisting} existants ` +
                `(orphelines=${summary.orphanItems}, skippedNoItemId=${summary.skippedNoItemId})`,
        );
        return summary;
    }

    /**
     * Map a Weezevent product to a MenuItem
     */
    async mapProductToMenuItem(user: any, productId: string, body: MapProductToMenuItemDto) {
        const tenantId = user.tenantId;

        // Verify product exists
        const product = await this.prisma.salesProduct.findFirst({
            where: { id: productId, tenantId },
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        // Verify menu item exists
        const menuItem = await this.prisma.menuItem.findFirst({
            where: { id: body.menuItemId, tenantId },
        });

        if (!menuItem) {
            throw new NotFoundException('Menu item not found');
        }

        // Create or update mapping
        const mapping = await this.prisma.productMapping.upsert({
            where: { salesProductId: productId },
            create: {
                tenantId,
                salesProductId: productId,
                menuItemId: body.menuItemId,
                autoMapped: body.autoMapped || false,
                confidence: body.confidence || null,
                mappedBy: user.id,
            },
            update: {
                menuItemId: body.menuItemId,
                autoMapped: body.autoMapped || false,
                confidence: body.confidence || null,
                mappedBy: user.id,
            },
        });

        // Rattache l'espace courant du wizard au menu item mappé (idempotent).
        // Un mapping ne porte pas d'espace ; sans ça l'article reste « mappé sans espace ».
        // Ligne SpaceMenuItem + skipDuplicates ; espace et item re-vérifiés côté tenant
        // (les deux ids viennent du body).
        if (body.spaceId) {
            const [space, item] = await Promise.all([
                this.prisma.space.findFirst({ where: { id: body.spaceId, tenantId }, select: { id: true } }),
                this.prisma.menuItem.findFirst({
                    where: { id: body.menuItemId, tenantId, deletedAt: null },
                    select: { id: true },
                }),
            ]);
            if (space && item) {
                await this.prisma.spaceMenuItem.createMany({
                    data: [{ menuItemId: item.id, spaceId: space.id }],
                    skipDuplicates: true,
                });
            }
        }

        return {
            success: true,
            mapping,
        };
    }

    /**
     * Get product mappings
     */
    async getProductMappings(user: any, params: WeezeventGetProductMappingsQueryDto) {
        const { page = 1, perPage = 50, integrationId } = params;
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);

        // Scoper par intégration filtre la liste ET permet de scoper l'agrégat ventes.
        const where: any = { tenantId };
        if (integrationId) where.salesProduct = { integrationId };

        const [mappings, total] = await Promise.all([
            this.prisma.productMapping.findMany({
                where,
                include: {
                    salesProduct: { include: { prices: true } },
                    menuItem: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (p - 1) * pp,
                take: pp,
            }),
            this.prisma.productMapping.count({ where }),
        ]);

        // Étape 3 Data Integration : on expose TOUT (le front décide quoi afficher) —
        // menuItem.pricing (catalogue) + weezeventProduct.pricing (référence Weezevent,
        // TVA + devise réelles) + weezeventProduct.salesPricing (réellement encaissé).
        // L'agrégat salesPricing est scopé à l'intégration si fournie (sinon tenant-wide).
        const data = await this.pricing.enrichMappingsPricing(mappings, tenantId, { integrationId });

        return {
            data,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
            },
        };
    }

    /**
     * Delete a product mapping
     */
    async unmapProduct(user: any, productId: string) {
        const tenantId = user.tenantId;

        await this.prisma.productMapping.deleteMany({
            where: {
                salesProductId: productId,
                tenantId,
            },
        });

        return { success: true };
    }
}
