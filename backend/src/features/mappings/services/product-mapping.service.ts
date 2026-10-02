import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { MenuItemPricingService } from '../../../shared/pricing/menu-item-pricing.service';
import { BulkProductMappingDto } from '../dto/mapping.dto';
import { productIdsSoldAtLocation, upsertProductMappings } from '../mappings.queries';
import { MappingSupportService } from './mapping-support.service';

/**
 * Rattachement des produits vendus aux articles du menu, et statistiques de rattachement.
 */
@Injectable()
export class ProductMappingService {
  constructor(
    private prisma: PrismaService,
    private pricing: MenuItemPricingService,
    private readonly mappingSupportService: MappingSupportService,
  ) {}

  private readonly logger = new Logger(ProductMappingService.name);

  /** Safe chunk size for Prisma $transaction batches (avoids timeouts/OOM at 100k+ items). */
  private readonly BULK_CHUNK_SIZE = 500;

  // ─── Product → MenuItem ──────────────────────────────────

  async getProductMappingStats(tenantId: string, integrationId?: string) {
    const productWhere: any = {
      tenantId,
      OR: [
        { productType: null },
        { productType: { not: 'VARIANT' } },
      ],
    };

    if (integrationId) {
      productWhere.integrationId = integrationId;
    }

    const [total, mapped] = await Promise.all([
      this.prisma.salesProduct.count({ where: productWhere }),
      this.prisma.productMapping.count({
        where: {
          tenantId,
          salesProduct: productWhere,
        },
      }),
    ]);

    return {
      total,
      mapped,
      unmapped: Math.max(total - mapped, 0),
    };
  }

  async getProductMappings(
    tenantId: string,
    weezeventLocationId?: string,
    page = 1,
    limit = 200,
    opts: {
      includeSales?: boolean;
      integrationId?: string;
      fromDate?: Date;
      toDate?: Date;
    } = {},
  ) {
    const { includeSales = false, integrationId, fromDate, toDate } = opts;
    this.logger.log(
      `Fetching product mappings for tenant ${tenantId} (location=${weezeventLocationId ?? 'all'}, integration=${integrationId ?? 'all'}, includeSales=${includeSales})`,
    );

    const where: any = { tenantId };

    // Scoper par intégration : filtre la liste ET permet de scoper l'agrégat ventes
    // (sans quoi `integrationId` exclurait à tort les ventes des autres intégrations).
    if (integrationId) {
      where.salesProduct = { integrationId };
    }

    if (weezeventLocationId) {
      // Filter by products sold at this location via transaction items
      where.salesProductId = { in: await productIdsSoldAtLocation(this.prisma, tenantId, weezeventLocationId) };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.prisma.productMapping.findMany({
        where,
        include: {
          salesProduct: { include: { prices: true } },
          menuItem: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.productMapping.count({ where }),
    ]);

    // menuItem.pricing (catalogue) + weezeventProduct.pricing (référence Weezevent, TVA +
    // devise réelles) sont calculés en mémoire (peu coûteux). En revanche salesPricing
    // (réellement encaissé) déclenche un agrégat lourd sur tout l'historique transactions
    // (~12 s/page en staging) → désactivé par défaut (includeSales=false) car le chargement
    // de l'étape 3 ne lit que les paires produit↔menuItem. Passer ?includeSales=true pour
    // l'obtenir explicitement (rapide si scopé par ?integrationId / fenêtre de dates).
    // Alias legacy AVANT enrichissement : le pricing et le front lisent weezeventProduct/-Id.
    const withLegacy = data.map((m) => this.mappingSupportService.withLegacyProductKeys(m));
    const enriched = await this.pricing.enrichMappingsPricing(withLegacy, tenantId, {
      includeSales,
      integrationId,
      fromDate,
      toDate,
    });

    return {
      data: enriched,
      meta: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  /**
   * Garantie « si c'est mappé, c'est visible » : remapper un produit vers un MenuItem qui a
   * été soft-deleted (ex. bulk-delete utilisateur puis ré-import) le réactive, afin qu'il
   * réapparaisse dans la liste Menu Items et le menu déroulant au lieu de laisser un mapping
   * pointant vers un article fantôme. Idempotent et borné au tenant.
   */
  private async resurrectSoftDeletedMenuItems(tenantId: string, menuItemIds: string[]) {
    const ids = [...new Set(menuItemIds.filter(Boolean))];
    if (ids.length === 0) return;
    const revived = await this.prisma.menuItem.updateMany({
      where: { tenantId, id: { in: ids }, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (revived.count > 0) {
      this.logger.log(`Resurrected ${revived.count} soft-deleted menu item(s) referenced by a new mapping`);
    }
  }

  /**
   * Rattache un espace aux menu items qui viennent d'être mappés. Un mapping
   * produit↔menuItem ne porte aucun espace ; sans cette écriture, l'article
   * reste « mappé mais sans espace » et le select « Espace » de sa fiche est vide.
   * Le wizard est l'unique endroit qui connaît l'espace courant → on l'ajoute ici.
   * Lignes SpaceMenuItem + `skipDuplicates` = idempotent (aucun doublon d'espace,
   * ne touche pas les items déjà rattachés). Espace ET items re-vérifiés côté
   * tenant avant écriture (le spaceId vient du DTO).
   */
  private async attachSpaceToMenuItems(
    tenantId: string,
    menuItemIds: string[],
    spaceId: string,
  ): Promise<number> {
    const ids = [...new Set(menuItemIds.filter(Boolean))];
    if (!spaceId || ids.length === 0) return 0;
    const [space, items] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true } }),
      this.prisma.menuItem.findMany({
        where: { tenantId, deletedAt: null, id: { in: ids } },
        select: { id: true },
      }),
    ]);
    if (!space || items.length === 0) return 0;
    const created = await this.prisma.spaceMenuItem.createMany({
      data: items.map((i) => ({ menuItemId: i.id, spaceId })),
      skipDuplicates: true,
    });
    if (created.count > 0) {
      this.logger.log(`Attached space ${spaceId} to ${created.count} menu item(s) via product mapping`);
    }
    return created.count;
  }

  async bulkProductMappings(dto: BulkProductMappingDto, tenantId: string, userId: string) {
    const uniqueMappings = Array.from(
      new Map(dto.mappings.map((m) => [m.weezeventProductId, m])).values(),
    );
    const total = uniqueMappings.length;
    this.logger.log(`Bulk mapping ${total} product-menu item pairs (chunk=${this.BULK_CHUNK_SIZE})`);

    const successes: any[] = [];
    const errors: { weezeventProductId: string; error: string }[] = [];

    // Produits et articles doivent appartenir au tenant : l'upsert en masse ne passe pas par
    // le filtre tenant automatique de Prisma. Les paires étrangères sont rejetées une par une.
    const [ownedProducts, ownedItems] = await Promise.all([
      this.prisma.salesProduct.findMany({
        where: { tenantId, id: { in: uniqueMappings.map((m) => m.weezeventProductId) } },
        select: { id: true },
      }),
      this.prisma.menuItem.findMany({
        where: { tenantId, id: { in: uniqueMappings.map((m) => m.menuItemId) } },
        select: { id: true },
      }),
    ]);
    const productOk = new Set(ownedProducts.map((p) => p.id));
    const itemOk = new Set(ownedItems.map((m) => m.id));
    const mappings = uniqueMappings.filter((m) => {
      if (productOk.has(m.weezeventProductId) && itemOk.has(m.menuItemId)) return true;
      errors.push({ weezeventProductId: m.weezeventProductId, error: 'Produit ou article introuvable pour ce tenant' });
      return false;
    });

    // Réactive les MenuItems soft-deleted ciblés avant de (re)créer les mappings.
    await this.resurrectSoftDeletedMenuItems(tenantId, mappings.map((m) => m.menuItemId));

    for (let i = 0; i < mappings.length; i += this.BULK_CHUNK_SIZE) {
      const chunk = mappings.slice(i, i + this.BULK_CHUNK_SIZE);
      try {
        await upsertProductMappings(this.prisma, tenantId, chunk, userId);

        successes.push(
          ...chunk.map((m) => ({
            tenantId,
            weezeventProductId: m.weezeventProductId,
            menuItemId: m.menuItemId,
            autoMapped: m.autoMapped || false,
            confidence: m.confidence || null,
            mappedBy: userId,
          })),
        );
      } catch (err) {
        this.logger.warn(`Chunk ${i / this.BULK_CHUNK_SIZE} failed, falling back to per-item upserts: ${err instanceof Error ? err.message : String(err)}`);
        for (const m of chunk) {
          try {
            const result = await this.prisma.productMapping.upsert({
              where: { salesProductId: m.weezeventProductId },
              create: {
                tenantId,
                salesProductId: m.weezeventProductId,
                menuItemId: m.menuItemId,
                autoMapped: m.autoMapped || false,
                confidence: m.confidence || null,
                mappedBy: userId,
              },
              update: {
                menuItemId: m.menuItemId,
                autoMapped: m.autoMapped || false,
                confidence: m.confidence || null,
                mappedBy: userId,
              },
            });
            successes.push(this.mappingSupportService.withLegacyProductKeys(result));
          } catch (itemErr) {
            errors.push({ weezeventProductId: m.weezeventProductId, error: itemErr instanceof Error ? itemErr.message : String(itemErr) });
          }
        }
      }
    }

    // Rattache l'espace courant du wizard aux items effectivement mappés (idempotent).
    if (dto.spaceId) {
      await this.attachSpaceToMenuItems(
        tenantId,
        successes.map((s: any) => s.menuItemId),
        dto.spaceId,
      );
    }

    this.mappingSupportService.purgeUnmappedCache(tenantId);
    return {
      count: successes.length,
      total,
      failed: errors.length,
      errors,
      mappings: successes,
    };
  }

  async deleteProductMapping(tenantId: string, weezeventProductId: string) {
    const result = await this.prisma.productMapping.deleteMany({
      where: { tenantId, salesProductId: weezeventProductId },
    });
    this.mappingSupportService.purgeUnmappedCache(tenantId);
    return result;
  }
}
