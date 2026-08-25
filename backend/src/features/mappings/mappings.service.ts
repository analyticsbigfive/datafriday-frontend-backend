;
import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { MenuItemPricingService } from '../../shared/pricing/menu-item-pricing.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { RedisService } from '../../core/redis/redis.service';
import { unmappedCachePattern } from '../../shared/constants/event-batch-cache';
import {
  CreateLocationSpaceMappingDto,
  CreateMerchantElementMappingDto,
  CreateLocationShopMappingDto,
  BulkMerchantElementMappingDto,
  BulkLocationShopMappingDto,
  BulkProductMappingDto,
} from './dto/mapping.dto';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

@Injectable()
export class MappingsService {
  private readonly logger = new Logger(MappingsService.name);

  /** Safe chunk size for Prisma $transaction batches (avoids timeouts/OOM at 100k+ items). */
  private readonly BULK_CHUNK_SIZE = 500;

  constructor(
    private prisma: PrismaService,
    private spacesService: SpacesService,
    private pricing: MenuItemPricingService,
    private spaceAccess: SpaceAccessService,
    // BUG-144-01 : RedisService injecté directement (RedisModule est @Global), même
    // pattern que AggregationService (BUG-143-01) — pour purger spaces:unmapped:* à
    // chaque écriture de mapping, condition qui permet de cacher analyse-unmapped.
    private redis: RedisService,
  ) {}

  /** BUG-144-01 : un mapping écrit/supprimé change le volume « non mappé » de l'Analyse —
   *  purge du cache par event (spaces:unmapped:{tenantId}:*). Fire-and-forget : une purge
   *  qui échoue ne doit pas faire échouer l'écriture du mapping (TTL court en filet). */
  private purgeUnmappedCache(tenantId: string) {
    Promise.resolve(this.redis.deletePattern(unmappedCachePattern(tenantId))).catch((e) =>
      this.logger.warn(`purgeUnmappedCache failed: ${e?.message}`),
    );
  }

  /** Lève 403 si `user` n'a pas accès à cet espace (cf. SpaceAccessService). */
  private async assertSpaceAccess(spaceId: string | null | undefined, user?: SpaceScopedUser) {
    if (!user || !spaceId) return;
    if (this.spaceAccess.hasFullAccess(user)) return;
    const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
    if (accessible === 'ALL' || accessible.includes(spaceId)) return;
    throw new ForbiddenException("Vous n'avez pas accès à l'espace de ce mapping.");
  }

  // Compat contrat front : les modèles Prisma renommés portent salesLocationId /
  // salesProductId ; l'API continue de servir les clés historiques weezevent*
  // (les deux clés sont présentes dans les réponses).
  private withLegacyLocationKey<T extends { salesLocationId: string }>(m: T) {
    return { ...m, weezeventLocationId: m.salesLocationId };
  }

  private withLegacyProductKeys<T extends { salesProductId: string }>(m: T) {
    const legacy: Record<string, unknown> = { ...m, weezeventProductId: m.salesProductId };
    if ('salesProduct' in m) legacy.weezeventProduct = (m as Record<string, unknown>).salesProduct;
    return legacy as T & { weezeventProductId: string; weezeventProduct?: unknown };
  }

  // ─── Location → Space ───────────────────────────────────

  async getLocationSpaceMappings(tenantId: string, page = 1, limit = 100, user?: SpaceScopedUser) {
    this.logger.log(`Fetching location-space mappings for tenant ${tenantId} (page=${page}, limit=${limit})`);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (Math.max(page, 1) - 1) * safeLimit;
    // Une location déjà mappée à un espace non accessible ne doit apparaître nulle part —
    // ni son mapping, ni (côté front) la carte d'intégration qui en dérive le nom d'espace.
    const where: any = { tenantId };
    if (user && !this.spaceAccess.hasFullAccess(user)) {
      const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
      if (accessible !== 'ALL') where.spaceId = { in: accessible };
    }
    const [data, total] = await Promise.all([
      this.prisma.locationSpaceMapping.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.locationSpaceMapping.count({ where }),
    ]);

    // Enrich with space name via batch fetch
    const spaceIds = [...new Set(data.map((m) => m.spaceId))];
    const spaces = spaceIds.length > 0
      ? await this.prisma.space.findMany({
          where: { id: { in: spaceIds } },
          select: { id: true, name: true },
        })
      : [];
    const spaceNameById = new Map(spaces.map((s) => [s.id, s.name]));
    const enriched = data.map((m) => ({
      ...this.withLegacyLocationKey(m),
      spaceName: spaceNameById.get(m.spaceId) ?? null,
    }));

    return {
      data: enriched,
      meta: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async getLocationSpaceMapping(tenantId: string, weezeventLocationId: string, user?: SpaceScopedUser) {
    const mapping = await this.prisma.locationSpaceMapping.findUnique({
      where: {
        tenantId_salesLocationId: { tenantId, salesLocationId: weezeventLocationId },
      },
    });
    if (mapping) await this.assertSpaceAccess(mapping.spaceId, user);
    return mapping ? this.withLegacyLocationKey(mapping) : mapping;
  }

  async createLocationSpaceMapping(dto: CreateLocationSpaceMappingDto, tenantId: string) {
    this.logger.log(`Mapping location ${dto.weezeventLocationId} → space ${dto.spaceId}`);

    // Verify space exists
    const space = await this.prisma.space.findFirst({
      where: { id: dto.spaceId, tenantId },
    });
    if (!space) {
      throw new NotFoundException(`Space ${dto.spaceId} not found`);
    }

    const mapping = await this.prisma.locationSpaceMapping.upsert({
      where: {
        tenantId_salesLocationId: {
          tenantId,
          salesLocationId: dto.weezeventLocationId,
        },
      },
      create: {
        tenantId,
        salesLocationId: dto.weezeventLocationId,
        spaceId: dto.spaceId,
      },
      update: {
        spaceId: dto.spaceId,
      },
    });

    // G7: stamp configurationId on all WeezeventEvents linked to this location.
    // Find the latest Config for the space and use it as reference.
    const latestConfig = await this.prisma.config.findFirst({
      where: { spaceId: dto.spaceId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (latestConfig) {
      const location = await this.prisma.salesLocation.findFirst({
        where: { id: dto.weezeventLocationId, tenantId },
        select: { integrationId: true },
      });
      if (location?.integrationId) {
        await this.prisma.salesEvent.updateMany({
          where: { tenantId, integrationId: location.integrationId },
          data: { configurationId: latestConfig.id },
        });
        this.logger.log(
          `G7: stamped configurationId=${latestConfig.id} on WeezeventEvents for integration=${location.integrationId}`,
        );
      }
    }

    return this.withLegacyLocationKey(mapping);
  }

  async deleteLocationSpaceMapping(tenantId: string, weezeventLocationId: string) {
    this.logger.log(`Deleting location-space mapping for location ${weezeventLocationId}`);
    return this.prisma.locationSpaceMapping.deleteMany({
      where: { tenantId, salesLocationId: weezeventLocationId },
    });
  }

  // ─── Location → SpaceElement ────────────────────────────

  async getLocationShopMappings(
    tenantId: string,
    weezeventLocationId?: string,
    spaceId?: string,
    page = 1,
    limit = 1000,
    user?: SpaceScopedUser,
  ) {
    this.logger.log(
      `Fetching location-shop mappings for tenant ${tenantId} (location=${weezeventLocationId ?? 'all'}, space=${spaceId ?? 'all'})`,
    );

    const where: any = { tenantId };
    if (weezeventLocationId) where.salesLocationId = weezeventLocationId;

    // spaceId explicite : déjà vérifié par SpaceAccessGuard (query param `spaceId`). Sans lui,
    // un utilisateur restreint ne doit voir que les shops de SES espaces accessibles — jamais
    // ceux de tout le tenant.
    let targetSpaceIds: string[] | undefined;
    if (spaceId) {
      targetSpaceIds = [spaceId];
    } else if (user && !this.spaceAccess.hasFullAccess(user)) {
      const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
      if (accessible !== 'ALL') targetSpaceIds = accessible;
    }

    if (targetSpaceIds) {
      // Use spaceId directly to avoid a deep 4-level JOIN chain (forecourt → config → space → tenantId).
      // tenantId scoping is enforced on the mapping itself via `where.tenantId = tenantId` above.
      const elements = await this.prisma.spaceElement.findMany({
        where: {
          OR: [
            { floor: { config: { spaceId: { in: targetSpaceIds } } } },
            { forecourt: { config: { spaceId: { in: targetSpaceIds } } } },
            { externalMerch: { config: { spaceId: { in: targetSpaceIds } } } },
            { zone: { spaceId: { in: targetSpaceIds } } }, // Builder v2
          ],
        },
        select: { id: true },
      });
      where.spaceElementId = { in: elements.map((element) => element.id) };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.prisma.locationShopMapping.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.locationShopMapping.count({ where }),
    ]);

    return {
      data: data.map((m) => this.withLegacyLocationKey(m)),
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async createLocationShopMapping(dto: CreateLocationShopMappingDto, tenantId: string) {
    this.logger.log(`Mapping Weezevent location ${dto.weezeventLocationId} → shop ${dto.spaceElementId}`);

    const element = await this.prisma.spaceElement.findFirst({
      where: {
        id: dto.spaceElementId,
        OR: [
          { floor: { config: { space: { tenantId } } } },
          { forecourt: { config: { space: { tenantId } } } },
          { externalMerch: { config: { space: { tenantId } } } },
          { zone: { space: { tenantId } } }, // Builder v2
        ],
      },
      select: { id: true },
    });

    if (!element) {
      throw new NotFoundException(`SpaceElement ${dto.spaceElementId} not found`);
    }

    const mapping = await this.prisma.locationShopMapping.upsert({
      where: {
        tenantId_salesLocationId: {
          tenantId,
          salesLocationId: dto.weezeventLocationId,
        },
      },
      create: {
        tenantId,
        salesLocationId: dto.weezeventLocationId,
        spaceElementId: dto.spaceElementId,
      },
      update: {
        spaceElementId: dto.spaceElementId,
      },
    });
    this.purgeUnmappedCache(tenantId);
    return this.withLegacyLocationKey(mapping);
  }

  async bulkLocationShopMappings(dto: BulkLocationShopMappingDto, tenantId: string) {
    const total = dto.mappings.length;
    this.logger.log(`Bulk mapping ${total} location-shop pairs (chunk=${this.BULK_CHUNK_SIZE})`);

    const successes: any[] = [];
    const errors: { weezeventLocationId: string; error: string }[] = [];

    for (let i = 0; i < total; i += this.BULK_CHUNK_SIZE) {
      const chunk = dto.mappings.slice(i, i + this.BULK_CHUNK_SIZE);
      try {
        const results = await this.prisma.$transaction(
          chunk.map((m) =>
            this.prisma.locationShopMapping.upsert({
              where: {
                tenantId_salesLocationId: {
                  tenantId,
                  salesLocationId: m.weezeventLocationId,
                },
              },
              create: {
                tenantId,
                salesLocationId: m.weezeventLocationId,
                spaceElementId: m.spaceElementId,
              },
              update: {
                spaceElementId: m.spaceElementId,
              },
            }),
          ),
        );
        successes.push(...results.map((r) => this.withLegacyLocationKey(r)));
      } catch (err) {
        this.logger.warn(`Location-shop chunk ${i / this.BULK_CHUNK_SIZE} failed, falling back to per-item upserts: ${err instanceof Error ? err.message : String(err)}`);
        for (const m of chunk) {
          try {
            const result = await this.createLocationShopMapping(m, tenantId);
            successes.push(result);
          } catch (itemErr) {
            errors.push({ weezeventLocationId: m.weezeventLocationId, error: itemErr instanceof Error ? itemErr.message : String(itemErr) });
          }
        }
      }
    }

    this.purgeUnmappedCache(tenantId);
    return {
      count: successes.length,
      total,
      failed: errors.length,
      errors,
      mappings: successes,
    };
  }

  async deleteLocationShopMapping(tenantId: string, weezeventLocationId: string) {
    const mapping = await this.prisma.locationShopMapping.findUnique({
      where: { tenantId_salesLocationId: { tenantId, salesLocationId: weezeventLocationId } },
      select: { spaceElementId: true },
    });

    const result = await this.prisma.locationShopMapping.deleteMany({
      where: { tenantId, salesLocationId: weezeventLocationId },
    });

    // If no other mapping references the space element, remove it from the
    // 3D builder too (Data Integration deletion ⇒ delete the 3D element).
    if (mapping?.spaceElementId) {
      try {
        await this.spacesService.deleteElementIfUnreferenced(mapping.spaceElementId, tenantId);
      } catch (err) {
        this.logger.warn(`Failed to cascade-delete SpaceElement ${mapping.spaceElementId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.purgeUnmappedCache(tenantId);
    return result;
  }

  // ─── Merchant → SpaceElement ─────────────────────────────

  async getMerchantElementMappings(
    tenantId: string,
    weezeventLocationId?: string,
    page = 1,
    limit = 200,
  ) {
    this.logger.log(`Fetching merchant-element mappings for tenant ${tenantId} (location=${weezeventLocationId ?? 'all'})`);

    const where: any = { tenantId };

    // If locationId provided, filter by merchants seen in transactions at this location
    if (weezeventLocationId) {
      const merchantTxs = await this.prisma.salesTransaction.findMany({
        where: { tenantId, locationId: weezeventLocationId, merchantId: { not: null } },
        select: { merchantId: true },
        distinct: ['merchantId'],
      });
      where.salesLocationId = { in: merchantTxs.map((m) => m.merchantId).filter(Boolean) };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.prisma.locationShopMapping.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.locationShopMapping.count({ where }),
    ]);

    return {
      data: data.map((m) => this.withLegacyLocationKey(m)),
      meta: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async createMerchantElementMapping(dto: CreateMerchantElementMappingDto, tenantId: string) {
    this.logger.log(`Mapping merchant ${dto.weezeventMerchantId} → element ${dto.spaceElementId}`);

    const element = await this.prisma.spaceElement.findFirst({
      where: {
        id: dto.spaceElementId,
        OR: [
          { floor: { config: { space: { tenantId } } } },
          { forecourt: { config: { space: { tenantId } } } },
          { externalMerch: { config: { space: { tenantId } } } },
          { zone: { space: { tenantId } } }, // Builder v2
        ],
      },
      select: { id: true },
    });
    if (!element) {
      throw new NotFoundException(`SpaceElement ${dto.spaceElementId} not found`);
    }

    const mapping = await this.prisma.locationShopMapping.upsert({
      where: {
        tenantId_salesLocationId: {
          tenantId,
          salesLocationId: dto.weezeventMerchantId,
        },
      },
      create: {
        tenantId,
        salesLocationId: dto.weezeventMerchantId,
        spaceElementId: dto.spaceElementId,
      },
      update: {
        spaceElementId: dto.spaceElementId,
      },
    });
    this.purgeUnmappedCache(tenantId);
    return this.withLegacyLocationKey(mapping);
  }

  async bulkMerchantElementMappings(dto: BulkMerchantElementMappingDto, tenantId: string) {
    const total = dto.mappings.length;
    this.logger.log(`Bulk mapping ${total} merchant-element pairs (chunk=${this.BULK_CHUNK_SIZE})`);

    const successes: any[] = [];
    const errors: { weezeventMerchantId: string; error: string }[] = [];

    for (let i = 0; i < total; i += this.BULK_CHUNK_SIZE) {
      const chunk = dto.mappings.slice(i, i + this.BULK_CHUNK_SIZE);

      const ownedElements = await this.prisma.spaceElement.findMany({
        where: {
          id: { in: chunk.map((m) => m.spaceElementId) },
          OR: [
            { floor: { config: { space: { tenantId } } } },
            { forecourt: { config: { space: { tenantId } } } },
            { externalMerch: { config: { space: { tenantId } } } },
            { zone: { space: { tenantId } } }, // Builder v2
          ],
        },
        select: { id: true },
      });
      const ownedIds = new Set(ownedElements.map((e) => e.id));

      const validItems = chunk.filter((m) => {
        if (!ownedIds.has(m.spaceElementId)) {
          errors.push({ weezeventMerchantId: m.weezeventMerchantId, error: `SpaceElement ${m.spaceElementId} not found` });
          return false;
        }
        return true;
      });
      if (!validItems.length) continue;

      try {
        const results = await this.prisma.$transaction(
          validItems.map((m) =>
            this.prisma.locationShopMapping.upsert({
              where: {
                tenantId_salesLocationId: {
                  tenantId,
                  salesLocationId: m.weezeventMerchantId,
                },
              },
              create: {
                tenantId,
                salesLocationId: m.weezeventMerchantId,
                spaceElementId: m.spaceElementId,
              },
              update: {
                spaceElementId: m.spaceElementId,
              },
            }),
          ),
        );
        successes.push(...results.map((r) => this.withLegacyLocationKey(r)));
      } catch (err) {
        // Chunk-level failure: fallback to per-item upsert so a single bad row doesn't lose the whole chunk
        this.logger.warn(`Chunk ${i / this.BULK_CHUNK_SIZE} failed, falling back to per-item upserts: ${err instanceof Error ? err.message : String(err)}`);
        for (const m of validItems) {
          try {
            const result = await this.createMerchantElementMapping(m, tenantId);
            successes.push(result);
          } catch (itemErr) {
            errors.push({ weezeventMerchantId: m.weezeventMerchantId, error: itemErr instanceof Error ? itemErr.message : String(itemErr) });
          }
        }
      }
    }

    this.purgeUnmappedCache(tenantId);
    return {
      count: successes.length,
      total,
      failed: errors.length,
      errors,
      mappings: successes,
    };
  }

  async deleteMerchantElementMapping(tenantId: string, weezeventMerchantId: string) {
    const mappings = await this.prisma.locationShopMapping.findMany({
      where: { tenantId, salesLocationId: weezeventMerchantId },
      select: { spaceElementId: true },
    });

    const result = await this.prisma.locationShopMapping.deleteMany({
      where: { tenantId, salesLocationId: weezeventMerchantId },
    });

    for (const { spaceElementId } of mappings) {
      try {
        await this.spacesService.deleteElementIfUnreferenced(spaceElementId, tenantId);
      } catch (err) {
        this.logger.warn(`Failed to cascade-delete SpaceElement ${spaceElementId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.purgeUnmappedCache(tenantId);
    return result;
  }

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
      const productIds = await this.prisma.$queryRaw<{ productId: string }[]>`
        SELECT DISTINCT ti."productId"
        FROM "WeezeventTransactionItem" ti
        JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
        WHERE t."tenantId" = ${tenantId}
          AND t."locationId" = ${weezeventLocationId}
          AND ti."productId" IS NOT NULL
      `;
      where.salesProductId = { in: productIds.map((p) => p.productId) };
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
    const withLegacy = data.map((m) => this.withLegacyProductKeys(m));
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

    // Réactive les MenuItems soft-deleted ciblés avant de (re)créer les mappings.
    await this.resurrectSoftDeletedMenuItems(tenantId, uniqueMappings.map((m) => m.menuItemId));

    const successes: any[] = [];
    const errors: { weezeventProductId: string; error: string }[] = [];

    for (let i = 0; i < total; i += this.BULK_CHUNK_SIZE) {
      const chunk = uniqueMappings.slice(i, i + this.BULK_CHUNK_SIZE);
      try {
        const now = new Date();
        const values = Prisma.join(
          chunk.map((m) => Prisma.sql`(
            ${randomUUID()},
            ${tenantId},
            ${m.weezeventProductId},
            ${m.menuItemId},
            ${m.autoMapped || false},
            ${m.confidence || null},
            ${userId},
            ${now},
            ${now}
          )`),
        );

        await this.prisma.$executeRaw`
          INSERT INTO "public"."WeezeventProductMapping"
            ("id", "tenantId", "weezeventProductId", "menuItemId", "autoMapped", "confidence", "mappedBy", "createdAt", "updatedAt")
          VALUES ${values}
          ON CONFLICT ("weezeventProductId") DO UPDATE SET
            "menuItemId" = EXCLUDED."menuItemId",
            "autoMapped" = EXCLUDED."autoMapped",
            "confidence" = EXCLUDED."confidence",
            "mappedBy" = EXCLUDED."mappedBy",
            "updatedAt" = EXCLUDED."updatedAt"
        `;

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
            successes.push(this.withLegacyProductKeys(result));
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

    this.purgeUnmappedCache(tenantId);
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
    this.purgeUnmappedCache(tenantId);
    return result;
  }

  // ─── Integration Progress ────────────────────────────────

  /**
   * Un point de vente de cette intégration (location cuid via createLocationShopMapping OU
   * merchant id via createMerchantElementMapping — les deux écrivent dans LocationShopMapping.
   * salesLocationId, cf. BUG-017) est-il mappé à un SpaceElement ?
   *
   * Source unique utilisée par getIntegrationProgress, getAllIntegrationProgress (step2) et
   * AggregationService.getStep4Context (hasMappings) — BUG-017/BUG-029 corrigés ensemble : ces 3
   * endroits réimplémentaient chacun leur propre logique de calcul, avec des définitions
   * divergentes (l'une comptait par merchantId en filtrant le mauvais champ, l'autre par location
   * cuid uniquement, la troisième ignorait complètement le scoping par intégration).
   */
  async hasShopMappingForIntegration(tenantId: string, integrationId: string): Promise<boolean> {
    const mapped = await this.getShopMappedIntegrationIds(tenantId, [integrationId]);
    return mapped.has(integrationId);
  }

  /**
   * Version batchée de hasShopMappingForIntegration : pour un ensemble d'intégrations, une seule
   * volée de requêtes (indépendante de N) plutôt que N×2 — utilisée par getAllIntegrationProgress.
   */
  private async getShopMappedIntegrationIds(
    tenantId: string,
    integrationIds: string[],
  ): Promise<Set<string>> {
    if (integrationIds.length === 0) return new Set();

    const [locations, merchantTxs, mappings] = await Promise.all([
      this.prisma.salesLocation.findMany({
        where: { tenantId, integrationId: { in: integrationIds } },
        select: { id: true, integrationId: true },
      }),
      this.prisma.salesTransaction.findMany({
        where: { tenantId, integrationId: { in: integrationIds }, merchantId: { not: null } },
        select: { merchantId: true, integrationId: true },
        distinct: ['merchantId'],
      }),
      this.prisma.locationShopMapping.findMany({
        where: { tenantId },
        select: { salesLocationId: true },
      }),
    ]);

    const mappedSalesLocationIds = new Set(mappings.map((m) => m.salesLocationId));
    const result = new Set<string>();

    for (const loc of locations) {
      if (mappedSalesLocationIds.has(loc.id)) result.add(loc.integrationId);
    }
    for (const tx of merchantTxs) {
      if (tx.merchantId && mappedSalesLocationIds.has(tx.merchantId)) result.add(tx.integrationId);
    }

    return result;
  }

  async getIntegrationProgress(tenantId: string, weezeventLocationId: string) {
    // Step 1: Location→Space mapping exists?
    const locationMapping = await this.prisma.locationSpaceMapping.findUnique({
      where: {
        tenantId_salesLocationId: { tenantId, salesLocationId: weezeventLocationId },
      },
    });

    const step1 = !!locationMapping;
    let step2 = false;
    let step3 = false;
    let step4 = false;
    let step5 = false;

    if (locationMapping) {
      // Step 2 (BUG-017 corrigé) : source unique partagée avec getAllIntegrationProgress et
      // AggregationService.getStep4Context — auparavant cette route comptait les mappings par
      // merchantId en filtrant WeezeventTransaction.locationId (mauvais espace d'id : ce champ
      // contient un cuid WeezeventLocation, pas l'integrationId reçu ici), donnant quasi toujours
      // step2=false. hasShopMappingForIntegration couvre les deux conventions réelles (location
      // cuid ET merchant id).
      step2 = await this.hasShopMappingForIntegration(tenantId, weezeventLocationId);

      // Step 3: Product→MenuItem mappings exist?
      const productMappings = await this.prisma.productMapping.count({
        where: { tenantId },
      });
      step3 = productMappings > 0;

      // Step 4: All past events have been aggregated?
      const [completedJobs, pastEventCount] = await Promise.all([
        this.prisma.aggregationJobLog.count({
          where: { tenantId, spaceId: locationMapping.spaceId, status: 'completed' },
        }),
        this.prisma.event.count({
          where: { tenantId, spaceId: locationMapping.spaceId, eventDate: { lte: new Date() } },
        }),
      ]);
      step4 = pastEventCount > 0 && completedJobs >= pastEventCount;

      // Step 5: Space revenue aggregations exist?
      const aggregations = await this.prisma.spaceRevenueMinuteAgg.count({
        where: {
          tenantId,
          spaceId: locationMapping.spaceId,
        },
      });
      step5 = aggregations > 0;
    }

    return {
      weezeventLocationId,
      spaceId: locationMapping?.spaceId || null,
      steps: {
        step1_space_mapped: step1,
        step2_shops_mapped: step2,
        step3_menu_mapped: step3,
        step4_events_processed: step4,
        step5_synchronized: step5,
      },
      completedSteps: [step1, step2, step3, step4, step5].filter(Boolean).length,
      totalSteps: 5,
    };
  }

  /**
   * Retourne la progression d'intégration pour toutes les intégrations Weezevent du tenant.
   * Optimisé : précharge les compteurs en parallèle pour éviter N×5 queries.
   * Utilisé par l'écran "LocationListItem" du wizard.
   *
   * Clé de conception :
   *  - L'entité primaire du wizard est WeezeventIntegration (= un compte Weezevent / "location" dans l'UI).
   *  - WeezeventLocationSpaceMapping.weezeventLocationId stocke l'integrationId (convention step1).
   *  - LocationShopMapping.salesLocationId stocke SOIT un WeezeventLocation.id (cuid), SOIT un
   *    merchantId, selon que le mapping a été fait via la route location ou merchant (step2, voir
   *    hasShopMappingForIntegration / getShopMappedIntegrationIds).
   */
  async getAllIntegrationProgress(tenantId: string) {
    this.logger.log(`Fetching integration progress for all integrations of tenant ${tenantId}`);

    // 1. Toutes les intégrations Weezevent du tenant (= "locations" dans le wizard)
    const integrations = await this.prisma.integration.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });

    if (integrations.length === 0) {
      return { data: [], meta: { total: 0 } };
    }

    const integrationIds = integrations.map((i) => i.id);

    // 2. Précharge en parallèle (évite N×5 queries série)
    const [
      locationMappings,          // step1 : integrationId → spaceId
      shopMappedIntegrationIds,  // step2 (BUG-017/029 : source unique, cf. plus bas)
      productMappingsCount,      // step3
      aggJobs,                   // step4 — completed jobs per spaceId
      pastEvents,                // step4 — past events per spaceId
      revenueAggs,               // step5
    ] = await Promise.all([
      // step1 : WeezeventLocationSpaceMapping.weezeventLocationId = integrationId (convention step1)
      this.prisma.locationSpaceMapping.findMany({
        where: { tenantId, salesLocationId: { in: integrationIds } },
        select: { salesLocationId: true, spaceId: true },
      }),
      this.getShopMappedIntegrationIds(tenantId, integrationIds),
      this.prisma.productMapping.count({ where: { tenantId } }),
      this.prisma.aggregationJobLog.groupBy({
        by: ['spaceId'],
        where: { tenantId, status: 'completed' },
        _count: true,
      }),
      this.prisma.event.groupBy({
        by: ['spaceId'],
        where: { tenantId, eventDate: { lte: new Date() } },
        _count: true,
      }),
      this.prisma.spaceRevenueMinuteAgg.groupBy({
        by: ['spaceId'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    // Index en Maps pour lookups O(1)
    const integSpaceMap = new Map(locationMappings.map((m) => [m.salesLocationId, m.spaceId]));
    const aggJobCountBySpace = new Map(aggJobs.filter((j) => j.spaceId).map((j) => [j.spaceId as string, j._count]));
    const pastEventCountBySpace = new Map(pastEvents.filter((e) => e.spaceId).map((e) => [e.spaceId as string, e._count]));
    const revenueBySpace = new Set(revenueAggs.map((r) => r.spaceId).filter(Boolean));

    // 3. Calcul par intégration
    const data = integrations.map((integ) => {
      // step1 : l'intégration est-elle liée à un espace ?
      const spaceId = integSpaceMap.get(integ.id) ?? null;
      const step1 = !!spaceId;

      // step2 : au moins un point de vente (location ou merchant) mappé à un SpaceElement ?
      const step2 = shopMappedIntegrationIds.has(integ.id);

      // step3 : global au tenant (pas par intégration)
      const step3 = productMappingsCount > 0;

      const pastEvtCount = (spaceId && pastEventCountBySpace.get(spaceId)) || 0;
      const completedJobCount = (spaceId && aggJobCountBySpace.get(spaceId)) || 0;
      const step4 = pastEvtCount > 0 && completedJobCount >= pastEvtCount;
      const step5 = !!spaceId && revenueBySpace.has(spaceId);

      const completedSteps = [step1, step2, step3, step4, step5].filter(Boolean).length;

      return {
        weezeventLocationId: integ.id, // compatibilité frontend : le wizard identifie les intégrations par leur id
        name: integ.name,
        spaceId,
        steps: {
          step1_space_mapped: step1,
          step2_shops_mapped: step2,
          step3_menu_mapped: step3,
          step4_events_processed: step4,
          step5_synchronized: step5,
        },
        completedSteps,
        totalSteps: 5,
      };
    });

    return {
      data,
      meta: {
        total: data.length,
        fullyConfigured: data.filter((d) => d.completedSteps === 5).length,
        partiallyConfigured: data.filter((d) => d.completedSteps > 0 && d.completedSteps < 5).length,
        notStarted: data.filter((d) => d.completedSteps === 0).length,
      },
    };
  }

  /**
   * Résumé post-sync pour une location : counts utiles à l'écran WizardSuccess.
   */
  async getLocationSummary(tenantId: string, weezeventLocationId: string) {
    const locationMapping = await this.prisma.locationSpaceMapping.findUnique({
      where: { tenantId_salesLocationId: { tenantId, salesLocationId: weezeventLocationId } },
    });
    if (!locationMapping) {
      throw new NotFoundException(`Location ${weezeventLocationId} not mapped to a space`);
    }

    const [merchantTxs, merchantMappings, productMappings, totalProducts, eventsCount] = await Promise.all([
      this.prisma.salesTransaction.findMany({
        where: { tenantId, locationId: weezeventLocationId, merchantId: { not: null } },
        select: { merchantId: true },
        distinct: ['merchantId'],
      }),
      this.prisma.locationShopMapping.count({ where: { tenantId } }),
      this.prisma.productMapping.count({ where: { tenantId } }),
      this.prisma.salesProduct.count({ where: { tenantId } }),
      this.prisma.aggregationJobLog.count({
        where: { tenantId, spaceId: locationMapping.spaceId, status: 'completed' },
      }),
    ]);

    return {
      weezeventLocationId,
      spaceId: locationMapping.spaceId,
      merchants: {
        total: merchantTxs.length,
        mapped: merchantMappings,
      },
      products: {
        total: totalProducts,
        mapped: productMappings,
      },
      events: {
        processed: eventsCount,
      },
    };
  }
}
