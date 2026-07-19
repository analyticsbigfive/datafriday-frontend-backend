import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class IndustrialsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.industrial.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  private async assertNoCaseInsensitiveDuplicate(name: string, tenantId: string, excludeId?: string) {
    const duplicate = await this.prisma.industrial.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(`An industrial "${name}" already exists`);
    }
  }

  async create(name: string, tenantId: string) {
    const trimmedName = name.trim();
    await this.assertNoCaseInsensitiveDuplicate(trimmedName, tenantId);
    try {
      return await this.prisma.industrial.create({
        data: { name: trimmedName, tenantId },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`An industrial "${name}" already exists`);
      }
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    const item = await this.prisma.industrial.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`Industrial ${id} not found`);
    return item;
  }

  async update(id: string, name: string | undefined, tenantId: string) {
    const item = await this.prisma.industrial.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`Industrial ${id} not found`);
    if (name === undefined) return item;

    const trimmedName = name.trim();
    await this.assertNoCaseInsensitiveDuplicate(trimmedName, tenantId, id);

    try {
      return await this.prisma.industrial.update({
        where: { id },
        data: { name: trimmedName },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`An industrial "${name}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    const item = await this.prisma.industrial.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`Industrial ${id} not found`);
    // BUG-86 : MarketPrice.industrial est onDelete: SetNull — sans cette garde, supprimer un
    // Industrial encore référencé détachait silencieusement industrialId de tous les
    // MarketPrice concernés.
    const marketPriceCount = await this.prisma.marketPrice.count({ where: { industrialId: id } });
    if (marketPriceCount > 0) {
      throw new ConflictException(
        `Impossible de supprimer cet industrial : ${marketPriceCount} prix marché en dépendent encore. Supprimez-les d'abord ou retirez cet industrial de leur fiche.`,
      );
    }
    await this.prisma.industrial.delete({ where: { id } });
    return { deleted: true };
  }
}
