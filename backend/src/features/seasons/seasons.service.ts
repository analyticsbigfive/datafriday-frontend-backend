import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Rapport Saison — persistance des périodes personnalisées (custom ranges
 * nommés, ex. « Saison 2025-2026 » du 1er juillet au 30 juin), chacune
 * rattachée à un ensemble de Spaces (ou à tous via allSpaces). Même schéma de
 * rattachement que HrSettingsService (jointure explicite, jamais de spaceIds
 * JSON — ADR-0003), MAIS sans règle d'unicité : deux saisons peuvent couvrir
 * le même espace en même temps (2024-25 et 2025-26 coexistent dans le picker).
 * tenantId auto-scopé par PrismaService ; on filtre quand même explicitement
 * (défense en profondeur).
 */
@Injectable()
export class SeasonsService {
  constructor(private prisma: PrismaService) {}

  /** Valide (allSpaces, spaceIds) et renvoie la liste d'espaces à rattacher. */
  private async resolveSpaces(
    allSpaces: boolean,
    spaceIds: string[] | undefined,
    tenantId: string,
  ): Promise<string[]> {
    if (allSpaces) return [];
    const ids = Array.from(new Set((spaceIds ?? []).filter(Boolean)));
    if (ids.length === 0) {
      throw new BadRequestException(
        'Sélectionnez au moins un espace, ou cochez « Tous » (allSpaces).',
      );
    }
    const found = await this.prisma.space.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('Un ou plusieurs espaces sélectionnés sont introuvables.');
    }
    return ids;
  }

  private assertValidRange(startDate: Date, endDate: Date) {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())
      || !(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Dates de saison invalides.');
    }
    if (endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestException('La date de fin doit être postérieure à la date de début.');
    }
  }

  private mapSeason(season: any) {
    return {
      id: season.id,
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      allSpaces: season.allSpaces,
      spaceIds: (season.spaces ?? []).map((s: any) => s.spaceId),
      createdAt: season.createdAt,
      updatedAt: season.updatedAt,
    };
  }

  async findAll(tenantId: string) {
    const seasons = await this.prisma.season.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
      include: { spaces: { select: { spaceId: true } } },
    });
    return { data: seasons.map((s) => this.mapSeason(s)) };
  }

  async create(
    input: { name: string; startDate: string; endDate: string; allSpaces?: boolean; spaceIds?: string[] },
    tenantId: string,
  ) {
    const allSpaces = !!input.allSpaces;
    const ids = await this.resolveSpaces(allSpaces, input.spaceIds, tenantId);
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    this.assertValidRange(startDate, endDate);

    const season = await this.prisma.season.create({
      data: {
        tenantId,
        name: input.name.trim(),
        startDate,
        endDate,
        allSpaces,
        spaces: { create: ids.map((spaceId) => ({ spaceId })) },
      },
      include: { spaces: { select: { spaceId: true } } },
    });
    return this.mapSeason(season);
  }

  async update(
    id: string,
    input: { name?: string; startDate?: string; endDate?: string; allSpaces?: boolean; spaceIds?: string[] },
    tenantId: string,
  ) {
    const existing = await this.prisma.season.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Season ${id} introuvable`);

    const startDate = input.startDate !== undefined ? new Date(input.startDate) : existing.startDate;
    const endDate = input.endDate !== undefined ? new Date(input.endDate) : existing.endDate;
    this.assertValidRange(startDate, endDate);

    const allSpaces = input.allSpaces ?? existing.allSpaces;
    // Ne recalculer la jointure que si le périmètre d'espaces est explicitement fourni.
    const spacesTouched = input.allSpaces !== undefined || input.spaceIds !== undefined;
    const ids = spacesTouched
      ? await this.resolveSpaces(allSpaces, input.spaceIds, tenantId)
      : null;

    const season = await this.prisma.$transaction(async (tx) => {
      if (spacesTouched) {
        await tx.seasonSpace.deleteMany({ where: { seasonId: id } });
      }
      return tx.season.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name.trim() }),
          ...(input.startDate !== undefined && { startDate }),
          ...(input.endDate !== undefined && { endDate }),
          ...(input.allSpaces !== undefined && { allSpaces }),
          ...(spacesTouched && { spaces: { create: (ids ?? []).map((spaceId) => ({ spaceId })) } }),
        },
        include: { spaces: { select: { spaceId: true } } },
      });
    });
    return this.mapSeason(season);
  }

  async remove(id: string, tenantId: string) {
    const existing = await this.prisma.season.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Season ${id} introuvable`);
    await this.prisma.season.delete({ where: { id } }); // cascade sur SeasonSpace
    return { deleted: true };
  }
}
