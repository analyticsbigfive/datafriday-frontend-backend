import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * CRUD for the Market Price taxonomy (MarketPriceType / MarketPriceCategory).
 * Mirrors the Menu Item taxonomy (ProductType / ProductCategory) but is a
 * fully separate set of tables so the two lists never share values.
 */
@Injectable()
export class MarketPriceTaxonomyService {
  private readonly logger = new Logger(MarketPriceTaxonomyService.name);

  constructor(private prisma: PrismaService) {}

  // ---------------- Duplicate guards (BUG-87) ----------------
  // Pre-insert case-insensitive check, same idiom as menu-items.service.ts:273 /
  // events.service.ts:593 (findFirst with mode: 'insensitive' scoped to tenantId),
  // thrown before the Prisma insert instead of relying solely on the DB unique
  // constraint (case-sensitive).

  private async assertNoDuplicateType(name: string, tenantId: string | null, excludeId?: string) {
    const duplicate = await this.prisma.marketPriceType.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new BadRequestException(`A market price type named "${name}" already exists`);
    }
  }

  private async assertNoDuplicateCategory(
    name: string,
    typeId: string,
    tenantId: string | null,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.marketPriceCategory.findFirst({
      where: {
        tenantId,
        typeId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new BadRequestException(`A market price category named "${name}" already exists for this type`);
    }
  }

  // ---------------- Types ----------------

  // BUG-169: bounded pagination, same shape/clamp as menu-items.service.ts findAll
  // ({ data, meta: { total, page, limit, totalPages } }, limit clamped to [1, 500],
  // default page=1/limit=200). Callers that need the full tenant list (dropdowns)
  // are expected to page through it client-side (see marketPriceTypes.js store).
  // Optional `search` (name, contains, insensitive) added for the List screen's
  // real server-side search, same idiom as menu-items.service.ts getProductTypes.
  async getTypes(tenantId: string, page = 1, limit = 200, search?: string) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (page - 1) * safeLimit;
    const where: any = {
      AND: [
        { OR: [{ tenantId }, { tenantId: null }] },
        ...(search ? [{ name: { contains: search, mode: 'insensitive' } }] : []),
      ],
    };
    const [data, total] = await Promise.all([
      this.prisma.marketPriceType.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          categories: {
            where: { OR: [{ tenantId }, { tenantId: null }] },
          },
        },
        skip,
        take: safeLimit,
      }),
      this.prisma.marketPriceType.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async createType(name: string, tenantId?: string) {
    await this.assertNoDuplicateType(name, tenantId ?? null);
    return this.prisma.marketPriceType.create({
      data: { name, tenantId },
      include: { categories: true },
    });
  }

  async updateType(id: string, name: string, tenantId: string) {
    const type = await this.prisma.marketPriceType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!type) {
      throw new NotFoundException(`Market price type with ID ${id} not found`);
    }
    if (type.tenantId === null) {
      throw new BadRequestException(`Cannot update global market price type`);
    }

    const nameChanged = name !== undefined && name !== type.name;
    if (nameChanged) {
      await this.assertNoDuplicateType(name, tenantId, id);
    }

    // BUG-83: MarketPrice.goodType is a free-text mirror of MarketPriceType.name
    // (kept alongside the real marketPriceTypeId FK). Propagate the rename to
    // every MarketPrice row pointing at this type, in the same transaction as
    // the taxonomy update, so existing rows never go stale.
    const [updated] = await this.prisma.$transaction([
      this.prisma.marketPriceType.update({
        where: { id },
        data: { name },
        include: { categories: true },
      }),
      ...(nameChanged
        ? [
            this.prisma.marketPrice.updateMany({
              where: { marketPriceTypeId: id },
              data: { goodType: name },
            }),
          ]
        : []),
    ]);
    this.logger.log(`Market price type ${id} updated`);
    return updated;
  }

  async deleteType(id: string, tenantId: string) {
    const type = await this.prisma.marketPriceType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!type) {
      throw new NotFoundException(`Market price type with ID ${id} not found`);
    }
    // BUG-82: MarketPriceCategory.type is onDelete: Cascade — without this guard,
    // deleting a MarketPriceType silently cascade-deleted its MarketPriceCategory
    // children. Same blocking pattern as BUG-75 (EventType/EventCategory), extended
    // to also block if any MarketPrice row still references this type directly.
    // Ces comptages ne filtrent pas par tenantId : pour un type global (tenantId null, partagé par
    // tous les tenants), c'est l'usage réel, tous tenants confondus, qui doit bloquer la suppression —
    // pas le simple fait d'être global. Un type système sans aucune dépendance est supprimable.
    const categoryCount = await this.prisma.marketPriceCategory.count({ where: { typeId: id } });
    if (categoryCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer ce type : ${categoryCount} catégorie(s) en dépendent encore. Supprimez-les d'abord.`,
      );
    }
    const marketPriceCount = await this.prisma.marketPrice.count({ where: { marketPriceTypeId: id } });
    if (marketPriceCount > 0) {
      // Payload structuré pour que le front propose un lien direct vers /market-prices filtré sur
      // ce type, plutôt que de laisser l'utilisateur chercher la bonne ligne à la main.
      throw new ConflictException({
        message: `Impossible de supprimer ce type : ${marketPriceCount} prix marché en dépendent encore. Réassignez-les d'abord.`,
        blockedBy: 'marketPrices',
        count: marketPriceCount,
        filterField: 'type',
        filterValue: type.name,
      });
    }
    await this.prisma.marketPriceType.delete({ where: { id } });
    this.logger.log(`Market price type ${id} deleted`);
  }

  // ---------------- Categories ----------------

  // BUG-169: same bounded-pagination shape as getTypes above. Optional `search`
  // (name, contains, insensitive) added for the List screen's real server-side search.
  async getCategories(tenantId: string, typeId?: string, page = 1, limit = 200, search?: string) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (page - 1) * safeLimit;
    const where: any = {
      AND: [
        { OR: [{ tenantId }, { tenantId: null }] },
        ...(typeId ? [{ typeId }] : []),
        ...(search ? [{ name: { contains: search, mode: 'insensitive' } }] : []),
      ],
    };
    const [data, total] = await Promise.all([
      this.prisma.marketPriceCategory.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { type: true },
        skip,
        take: safeLimit,
      }),
      this.prisma.marketPriceCategory.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async createCategory(name: string, typeId: string | undefined, tenantId?: string) {
    if (!typeId) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'typeId',
            constraints: {
              isNotEmpty: 'typeId should not be empty',
              isString: 'typeId must be a string',
            },
            messages: ['typeId should not be empty', 'typeId must be a string'],
            value: typeId,
          },
        ],
      });
    }

    const type = await this.prisma.marketPriceType.findFirst({
      where: { id: typeId, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!type) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'typeId',
            constraints: { exists: 'typeId must reference an accessible market price type' },
            messages: ['typeId must reference an accessible market price type'],
            value: typeId,
          },
        ],
      });
    }

    await this.assertNoDuplicateCategory(name, typeId, tenantId ?? null);

    return this.prisma.marketPriceCategory.create({
      data: { name, tenantId, type: { connect: { id: typeId } } },
      include: { type: true },
    });
  }

  async updateCategory(
    id: string,
    data: { name?: string; typeId?: string },
    tenantId: string,
  ) {
    const category = await this.prisma.marketPriceCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!category) {
      throw new NotFoundException(`Market price category with ID ${id} not found`);
    }
    if (category.tenantId === null) {
      throw new BadRequestException(`Cannot update global market price category`);
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;

    if (data.typeId !== undefined) {
      const type = await this.prisma.marketPriceType.findFirst({
        where: { id: data.typeId, OR: [{ tenantId }, { tenantId: null }] },
      });
      if (!type) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [
            {
              property: 'typeId',
              constraints: { exists: 'typeId must reference an accessible market price type' },
              messages: ['typeId must reference an accessible market price type'],
              value: data.typeId,
            },
          ],
        });
      }
      updateData.type = { connect: { id: data.typeId } };
    }

    const nameChanged = data.name !== undefined && data.name !== category.name;
    if (nameChanged) {
      const effectiveTypeId = data.typeId ?? category.typeId;
      await this.assertNoDuplicateCategory(data.name as string, effectiveTypeId, tenantId, id);
    }

    // BUG-83: MarketPrice.category is a free-text mirror of MarketPriceCategory.name
    // (kept alongside the real marketPriceCategoryId FK). Propagate the rename to
    // every MarketPrice row pointing at this category, in the same transaction as
    // the taxonomy update, so existing rows never go stale.
    const [updated] = await this.prisma.$transaction([
      this.prisma.marketPriceCategory.update({
        where: { id },
        data: updateData,
        include: { type: true },
      }),
      ...(nameChanged
        ? [
            this.prisma.marketPrice.updateMany({
              where: { marketPriceCategoryId: id },
              data: { category: data.name },
            }),
          ]
        : []),
    ]);
    this.logger.log(`Market price category ${id} updated`);
    return updated;
  }

  async deleteCategory(id: string, tenantId: string) {
    const category = await this.prisma.marketPriceCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!category) {
      throw new NotFoundException(`Market price category with ID ${id} not found`);
    }
    // BUG-82: block deletion while MarketPrice rows still reference this category,
    // same guard family as deleteType above.
    // Comptage non filtré par tenantId : pour une catégorie globale, c'est l'usage réel tous
    // tenants confondus qui doit bloquer la suppression — pas le simple fait d'être globale.
    const marketPriceCount = await this.prisma.marketPrice.count({
      where: { marketPriceCategoryId: id },
    });
    if (marketPriceCount > 0) {
      throw new ConflictException({
        message: `Impossible de supprimer cette catégorie : ${marketPriceCount} prix marché en dépendent encore. Réassignez-les d'abord.`,
        blockedBy: 'marketPrices',
        count: marketPriceCount,
        filterField: 'category',
        filterValue: category.name,
      });
    }
    await this.prisma.marketPriceCategory.delete({ where: { id } });
    this.logger.log(`Market price category ${id} deleted`);
  }
}
