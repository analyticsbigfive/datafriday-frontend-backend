import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { findDistinctMerchantIds } from '../../../shared/sales/distinct-merchants.queries';
import { CreateMerchantElementMappingDto, BulkMerchantElementMappingDto } from '../dto/mapping.dto';
import { SpaceElementService } from '../../spaces/services/space-element.service';
import { MappingSupportService } from './mapping-support.service';

/**
 * Rattachement des marchands aux éléments d'un espace.
 */
@Injectable()
export class MerchantMappingService {
  constructor(
    private prisma: PrismaService,
    private readonly spaceElementService: SpaceElementService,
    private readonly mappingSupportService: MappingSupportService,
  ) {}

  private readonly logger = new Logger(MerchantMappingService.name);

  /** Safe chunk size for Prisma $transaction batches (avoids timeouts/OOM at 100k+ items). */
  private readonly BULK_CHUNK_SIZE = 500;

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
      const merchantIds = await findDistinctMerchantIds(this.prisma, { tenantId, locationId: weezeventLocationId });
      where.salesLocationId = { in: merchantIds };
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
      data: data.map((m) => this.mappingSupportService.withLegacyLocationKey(m)),
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
    this.mappingSupportService.purgeUnmappedCache(tenantId);
    return this.mappingSupportService.withLegacyLocationKey(mapping);
  }

  async bulkMerchantElementMappings(dto: BulkMerchantElementMappingDto, tenantId: string) {
    const total = dto.mappings.length;
    this.logger.log(`Bulk mapping ${total} merchant-element pairs (chunk=${this.BULK_CHUNK_SIZE})`);

    const successes: any[] = [];
    const errors: { weezeventMerchantId: string; error: string }[] = [];

    for (let i = 0; i < total; i += this.BULK_CHUNK_SIZE) {
      const chunk = dto.mappings.slice(i, i + this.BULK_CHUNK_SIZE);

      // eslint-disable-next-line no-await-in-loop -- lots de rattachements, reprise ligne par ligne si un lot échoue
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
        // eslint-disable-next-line no-await-in-loop -- lots de rattachements, reprise ligne par ligne si un lot échoue
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
        successes.push(...results.map((r) => this.mappingSupportService.withLegacyLocationKey(r)));
      } catch (err) {
        // Chunk-level failure: fallback to per-item upsert so a single bad row doesn't lose the whole chunk
        this.logger.warn(`Chunk ${i / this.BULK_CHUNK_SIZE} failed, falling back to per-item upserts: ${err instanceof Error ? err.message : String(err)}`);
        for (const m of validItems) {
          try {
            // eslint-disable-next-line no-await-in-loop -- lots de rattachements, reprise ligne par ligne si un lot échoue
            const result = await this.createMerchantElementMapping(m, tenantId);
            successes.push(result);
          } catch (itemErr) {
            errors.push({ weezeventMerchantId: m.weezeventMerchantId, error: itemErr instanceof Error ? itemErr.message : String(itemErr) });
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
        // eslint-disable-next-line no-await-in-loop -- lots de rattachements, reprise ligne par ligne si un lot échoue
        await this.spaceElementService.deleteElementIfUnreferenced(spaceElementId, tenantId);
      } catch (err) {
        this.logger.warn(`Failed to cascade-delete SpaceElement ${spaceElementId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.mappingSupportService.purgeUnmappedCache(tenantId);
    return result;
  }
}
