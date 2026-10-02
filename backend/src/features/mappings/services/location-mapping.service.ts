import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { CreateLocationSpaceMappingDto, CreateLocationShopMappingDto, BulkLocationShopMappingDto } from '../dto/mapping.dto';
import { SpaceElementService } from '../../spaces/services/space-element.service';
import { MappingSupportService } from './mapping-support.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

const ASSERT_SPACE_ACCESS_DENIED = "Vous n'avez pas accès à l'espace de ce mapping.";

/**
 * Rattachement des lieux de vente aux espaces et aux shops.
 */
@Injectable()
export class LocationMappingService {
  constructor(
    private prisma: PrismaService,
    private readonly spaceElementService: SpaceElementService,
    private spaceAccess: SpaceAccessService,
    private readonly mappingSupportService: MappingSupportService,
  ) {}

  private readonly logger = new Logger(LocationMappingService.name);

  /** Safe chunk size for Prisma $transaction batches (avoids timeouts/OOM at 100k+ items). */
  private readonly BULK_CHUNK_SIZE = 500;

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
      ...this.mappingSupportService.withLegacyLocationKey(m),
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
    if (mapping) await this.spaceAccess.assertCanAccessSpace(user, mapping.spaceId, ASSERT_SPACE_ACCESS_DENIED);
    return mapping ? this.mappingSupportService.withLegacyLocationKey(mapping) : mapping;
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

    return this.mappingSupportService.withLegacyLocationKey(mapping);
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
      data: data.map((m) => this.mappingSupportService.withLegacyLocationKey(m)),
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
    this.mappingSupportService.purgeUnmappedCache(tenantId);
    return this.mappingSupportService.withLegacyLocationKey(mapping);
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
        successes.push(...results.map((r) => this.mappingSupportService.withLegacyLocationKey(r)));
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

    this.mappingSupportService.purgeUnmappedCache(tenantId);
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
        await this.spaceElementService.deleteElementIfUnreferenced(mapping.spaceElementId, tenantId);
      } catch (err) {
        this.logger.warn(`Failed to cascade-delete SpaceElement ${mapping.spaceElementId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.mappingSupportService.purgeUnmappedCache(tenantId);
    return result;
  }
}
