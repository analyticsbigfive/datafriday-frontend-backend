import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class PackingTypesService {
  constructor(private prisma: PrismaService) {}

  // BUG-169: pagination bornée, même forme/clamp que menu-items.service.ts findAll —
  // { data, meta: { total, page, limit, totalPages } }. Le store frontend boucle sur les
  // pages (voir flatReferentialModule.js) pour reconstituer la liste complète côté
  // dropdown/picker sans jamais tronquer silencieusement.
  async findAll(tenantId: string, page = 1, limit = 200, search?: string) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const where: any = { tenantId };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [data, total] = await Promise.all([
      this.prisma.packingType.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.packingType.count({ where }),
    ]);
    return {
      data,
      meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) || 1 },
    };
  }

  // BUG-87: pre-insert case-insensitive duplicate check, same idiom as
  // menu-items.service.ts:273 / events.service.ts:593 (findFirst with
  // mode: 'insensitive' scoped to tenantId) instead of relying solely on the
  // DB unique constraint (@@unique([tenantId, name]), case-sensitive).
  private async assertNoDuplicateName(name: string, tenantId: string, excludeId?: string) {
    const duplicate = await this.prisma.packingType.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) {
      throw new BadRequestException(`A packing type "${name}" already exists`);
    }
  }

  async create(name: string, tenantId: string) {
    const trimmed = name.trim();
    await this.assertNoDuplicateName(trimmed, tenantId);
    try {
      return await this.prisma.packingType.create({
        data: { name: trimmed, tenantId },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`A packing type "${name}" already exists`);
      }
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    const item = await this.prisma.packingType.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`PackingType ${id} not found`);
    return item;
  }

  async update(id: string, name: string | undefined, tenantId: string) {
    const item = await this.prisma.packingType.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`PackingType ${id} not found`);
    if (name === undefined) return item;

    const trimmed = name.trim();
    const oldName = item.name;
    const nameChanged = trimmed !== oldName;
    if (nameChanged) {
      await this.assertNoDuplicateName(trimmed, tenantId, id);
    }

    try {
      // BUG-84: PackingType has no FK at all — MarketPrice.purchasePackaging/
      // inventoryPackaging and MenuComponent.inventoryPackaging store its name as
      // plain text. Propagate the rename to those rows in the same transaction
      // ("option a minima" from the bug doc) so they don't silently go stale.
      const [updated] = await this.prisma.$transaction([
        this.prisma.packingType.update({
          where: { id },
          data: { name: trimmed },
        }),
        ...(nameChanged
          ? [
              this.prisma.marketPrice.updateMany({
                where: { purchasePackaging: oldName, tenantId },
                data: { purchasePackaging: trimmed },
              }),
              this.prisma.marketPrice.updateMany({
                where: { inventoryPackaging: oldName, tenantId },
                data: { inventoryPackaging: trimmed },
              }),
              this.prisma.menuComponent.updateMany({
                where: { inventoryPackaging: oldName, tenantId },
                data: { inventoryPackaging: trimmed },
              }),
            ]
          : []),
      ]);
      return updated;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`A packing type "${name}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    const item = await this.prisma.packingType.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`PackingType ${id} not found`);

    // BUG-84: PackingType has no FK to cascade/null on delete — block deletion
    // while any MarketPrice/MenuComponent row still carries this name as free text,
    // same blocking pattern as BUG-82 (deleteType/deleteCategory).
    const [purchaseCount, inventoryMarketPriceCount, inventoryComponentCount] = await Promise.all([
      this.prisma.marketPrice.count({ where: { purchasePackaging: item.name, tenantId } }),
      this.prisma.marketPrice.count({ where: { inventoryPackaging: item.name, tenantId } }),
      this.prisma.menuComponent.count({ where: { inventoryPackaging: item.name, tenantId } }),
    ]);
    const totalUsage = purchaseCount + inventoryMarketPriceCount + inventoryComponentCount;
    if (totalUsage > 0) {
      throw new ConflictException(
        `Impossible de supprimer ce packing type : ${totalUsage} ligne(s) (Market Price/Menu Component) l'utilisent encore.`,
      );
    }

    await this.prisma.packingType.delete({ where: { id } });
    return { deleted: true };
  }
}
