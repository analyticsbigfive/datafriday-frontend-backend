import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class BrandsService {
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
      this.prisma.brand.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.brand.count({ where }),
    ]);
    return {
      data,
      meta: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) || 1 },
    };
  }

  private async assertNoCaseInsensitiveDuplicate(name: string, tenantId: string, excludeId?: string) {
    const duplicate = await this.prisma.brand.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(`A brand named "${name}" already exists`);
    }
  }

  async create(name: string, tenantId: string) {
    const trimmedName = name.trim();
    await this.assertNoCaseInsensitiveDuplicate(trimmedName, tenantId);
    try {
      return await this.prisma.brand.create({
        data: { name: trimmedName, tenantId },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`A brand named "${name}" already exists`);
      }
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    const brand = await this.prisma.brand.findFirst({ where: { id, tenantId } });
    if (!brand) throw new NotFoundException(`Brand ${id} not found`);
    return brand;
  }

  async update(id: string, name: string | undefined, tenantId: string) {
    const brand = await this.prisma.brand.findFirst({ where: { id, tenantId } });
    if (!brand) throw new NotFoundException(`Brand ${id} not found`);
    if (name === undefined) return brand;

    const trimmedName = name.trim();
    await this.assertNoCaseInsensitiveDuplicate(trimmedName, tenantId, id);

    try {
      return await this.prisma.brand.update({
        where: { id },
        data: { name: trimmedName },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`A brand named "${name}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    const brand = await this.prisma.brand.findFirst({ where: { id, tenantId } });
    if (!brand) throw new NotFoundException(`Brand ${id} not found`);
    // BUG-85 : MenuItem.brand est onDelete: SetNull — sans cette garde, supprimer un Brand
    // encore référencé détachait silencieusement brandId de tous les MenuItem concernés.
    const menuItemCount = await this.prisma.menuItem.count({ where: { brandId: id } });
    if (menuItemCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer ce brand : ${menuItemCount} article(s) de menu en dépendent encore. Supprimez-les d'abord ou retirez ce brand de leur fiche.`,
      );
    }
    await this.prisma.brand.delete({ where: { id } });
    return { deleted: true };
  }
}
