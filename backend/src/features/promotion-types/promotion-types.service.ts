import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class PromotionTypesService {
  constructor(private prisma: PrismaService) {}

  // Même forme/clamp de pagination que display-names.service.ts findAll —
  // { data, meta: { total, page, limit, totalPages } }. Le store frontend boucle sur les pages
  // (flatReferentialModule.js) pour reconstituer la liste complète côté dropdown.
  async findAll(tenantId: string, page = 1, limit = 200, search?: string) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const where: any = { tenantId };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [data, total] = await Promise.all([
      this.prisma.promotionType.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.promotionType.count({ where }),
    ]);
    return {
      data,
      meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) || 1 },
    };
  }

  private async assertNoCaseInsensitiveDuplicate(name: string, tenantId: string, excludeId?: string) {
    const duplicate = await this.prisma.promotionType.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(`A promotion type "${name}" already exists`);
    }
  }

  async create(name: string, tenantId: string) {
    const trimmedName = name.trim();
    await this.assertNoCaseInsensitiveDuplicate(trimmedName, tenantId);
    try {
      return await this.prisma.promotionType.create({
        data: { name: trimmedName, tenantId },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`A promotion type "${name}" already exists`);
      }
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    const item = await this.prisma.promotionType.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`PromotionType ${id} not found`);
    return item;
  }

  async update(id: string, name: string | undefined, tenantId: string) {
    const item = await this.prisma.promotionType.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`PromotionType ${id} not found`);
    if (name === undefined) return item;

    const trimmedName = name.trim();
    await this.assertNoCaseInsensitiveDuplicate(trimmedName, tenantId, id);

    try {
      return await this.prisma.promotionType.update({
        where: { id },
        data: { name: trimmedName },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`A promotion type "${name}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    const item = await this.prisma.promotionType.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`PromotionType ${id} not found`);
    // Promotion.promotionTypeId est onDelete: SetNull — garde-fou (comme DisplayName) : on
    // refuse la suppression tant que des promotions y font référence, pour éviter de les
    // détacher silencieusement.
    const promotionCount = await this.prisma.promotion.count({ where: { promotionTypeId: id } });
    if (promotionCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer ce type de promotion : ${promotionCount} promotion(s) en dépendent encore. Retirez-le de leur fiche d'abord.`,
      );
    }
    await this.prisma.promotionType.delete({ where: { id } });
    return { deleted: true };
  }
}
