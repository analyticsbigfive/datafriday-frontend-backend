import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Settings HR — persistance des 2 variables paramétrables (Goal/TPE et nombre de
 * staff par Responsable de zone), chacune rattachée à un ensemble de Spaces
 * (ou à tous via allSpaces). Table de jointure explicite (pas de spaceIds JSON,
 * colonne gelée interdite — ADR-0003). tenantId auto-scopé par PrismaService ;
 * on filtre quand même explicitement par tenantId (défense en profondeur, cf.
 * brands.service.ts).
 */
@Injectable()
export class HrSettingsService {
  constructor(private prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

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

  // CFG-2 (2026-08-01, question #41 tranchée par l'utilisateur : "on a toujours 1 valeur — faire
  // en groupe ou individuellement garde 1 valeur") : un espace ne doit JAMAIS être couvert par
  // deux lignes actives à la fois, que ce soit deux lignes spécifiques qui se recoupent ou une
  // ligne "Tous" en plus d'une ligne spécifique. Garanti par construction (rejet à la création/
  // modification) plutôt que résolu après coup — élimine le besoin même d'une règle de
  // désambiguïsation (ex-hypothèse "spécifique > TOUS, plus récente gagne", jamais confirmée).
  private async assertNoGoalOverlap(
    allSpaces: boolean,
    spaceIds: string[],
    tenantId: string,
    excludeId?: string,
  ) {
    if (allSpaces) {
      const existing = await this.prisma.hrGoal.findFirst({
        where: { tenantId, allSpaces: true, ...(excludeId && { id: { not: excludeId } }) },
      });
      if (existing) {
        throw new BadRequestException(
          'Une ligne « Tous les espaces » existe déjà pour ce paramètre — modifiez-la plutôt que d\'en créer une nouvelle.',
        );
      }
      return;
    }
    const conflict = await this.prisma.hrGoalSpace.findFirst({
      where: { spaceId: { in: spaceIds }, goal: { tenantId, ...(excludeId && { id: { not: excludeId } }) } },
      include: { goal: true, space: { select: { name: true } } },
    });
    if (conflict) {
      throw new BadRequestException(
        `L'espace « ${conflict.space.name} » a déjà une valeur (${conflict.goal.goalPerTpe} €/TPE) sur une autre ligne — chaque espace ne peut avoir qu'une seule valeur active.`,
      );
    }
  }

  private async assertNoRatioOverlap(
    allSpaces: boolean,
    spaceIds: string[],
    tenantId: string,
    excludeId?: string,
  ) {
    if (allSpaces) {
      const existing = await this.prisma.hrStaffRatio.findFirst({
        where: { tenantId, allSpaces: true, ...(excludeId && { id: { not: excludeId } }) },
      });
      if (existing) {
        throw new BadRequestException(
          'Une ligne « Tous les espaces » existe déjà pour ce paramètre — modifiez-la plutôt que d\'en créer une nouvelle.',
        );
      }
      return;
    }
    const conflict = await this.prisma.hrStaffRatioSpace.findFirst({
      where: { spaceId: { in: spaceIds }, ratio: { tenantId, ...(excludeId && { id: { not: excludeId } }) } },
      include: { ratio: true, space: { select: { name: true } } },
    });
    if (conflict) {
      throw new BadRequestException(
        `L'espace « ${conflict.space.name} » a déjà une valeur (${conflict.ratio.staffPerZoneManager}) sur une autre ligne — chaque espace ne peut avoir qu'une seule valeur active.`,
      );
    }
  }

  private mapGoal(goal: any) {
    return {
      id: goal.id,
      goalPerTpe: goal.goalPerTpe,
      allSpaces: goal.allSpaces,
      spaceIds: (goal.spaces ?? []).map((s: any) => s.spaceId),
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    };
  }

  private mapRatio(ratio: any) {
    return {
      id: ratio.id,
      staffPerZoneManager: ratio.staffPerZoneManager,
      allSpaces: ratio.allSpaces,
      spaceIds: (ratio.spaces ?? []).map((s: any) => s.spaceId),
      createdAt: ratio.createdAt,
      updatedAt: ratio.updatedAt,
    };
  }

  // ── Goals (CA par TPE) ───────────────────────────────────────────────────────

  async findAllGoals(tenantId: string) {
    const goals = await this.prisma.hrGoal.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: { spaces: { select: { spaceId: true } } },
    });
    return { data: goals.map((g) => this.mapGoal(g)) };
  }

  async createGoal(
    input: { goalPerTpe: number; allSpaces?: boolean; spaceIds?: string[] },
    tenantId: string,
  ) {
    const allSpaces = !!input.allSpaces;
    const ids = await this.resolveSpaces(allSpaces, input.spaceIds, tenantId);
    await this.assertNoGoalOverlap(allSpaces, ids, tenantId);
    const goal = await this.prisma.hrGoal.create({
      data: {
        tenantId,
        goalPerTpe: input.goalPerTpe,
        allSpaces,
        spaces: { create: ids.map((spaceId) => ({ spaceId })) },
      },
      include: { spaces: { select: { spaceId: true } } },
    });
    return this.mapGoal(goal);
  }

  async updateGoal(
    id: string,
    input: { goalPerTpe?: number; allSpaces?: boolean; spaceIds?: string[] },
    tenantId: string,
  ) {
    const existing = await this.prisma.hrGoal.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrGoal ${id} introuvable`);

    const allSpaces = input.allSpaces ?? existing.allSpaces;
    // Ne recalculer la jointure que si le périmètre d'espaces est explicitement fourni.
    const spacesTouched = input.allSpaces !== undefined || input.spaceIds !== undefined;
    const ids = spacesTouched
      ? await this.resolveSpaces(allSpaces, input.spaceIds, tenantId)
      : null;
    if (spacesTouched) {
      await this.assertNoGoalOverlap(allSpaces, ids ?? [], tenantId, id);
    }

    const goal = await this.prisma.$transaction(async (tx) => {
      if (spacesTouched) {
        await tx.hrGoalSpace.deleteMany({ where: { goalId: id } });
      }
      return tx.hrGoal.update({
        where: { id },
        data: {
          ...(input.goalPerTpe !== undefined && { goalPerTpe: input.goalPerTpe }),
          ...(input.allSpaces !== undefined && { allSpaces }),
          ...(spacesTouched && { spaces: { create: (ids ?? []).map((spaceId) => ({ spaceId })) } }),
        },
        include: { spaces: { select: { spaceId: true } } },
      });
    });
    return this.mapGoal(goal);
  }

  async removeGoal(id: string, tenantId: string) {
    const existing = await this.prisma.hrGoal.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrGoal ${id} introuvable`);
    await this.prisma.hrGoal.delete({ where: { id } }); // cascade sur HrGoalSpace
    return { deleted: true };
  }

  // ── Staff par Responsable de zone ────────────────────────────────────────────

  async findAllStaffRatios(tenantId: string) {
    const ratios = await this.prisma.hrStaffRatio.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: { spaces: { select: { spaceId: true } } },
    });
    return { data: ratios.map((r) => this.mapRatio(r)) };
  }

  async createStaffRatio(
    input: { staffPerZoneManager: number; allSpaces?: boolean; spaceIds?: string[] },
    tenantId: string,
  ) {
    const allSpaces = !!input.allSpaces;
    const ids = await this.resolveSpaces(allSpaces, input.spaceIds, tenantId);
    await this.assertNoRatioOverlap(allSpaces, ids, tenantId);
    const ratio = await this.prisma.hrStaffRatio.create({
      data: {
        tenantId,
        staffPerZoneManager: input.staffPerZoneManager,
        allSpaces,
        spaces: { create: ids.map((spaceId) => ({ spaceId })) },
      },
      include: { spaces: { select: { spaceId: true } } },
    });
    return this.mapRatio(ratio);
  }

  async updateStaffRatio(
    id: string,
    input: { staffPerZoneManager?: number; allSpaces?: boolean; spaceIds?: string[] },
    tenantId: string,
  ) {
    const existing = await this.prisma.hrStaffRatio.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrStaffRatio ${id} introuvable`);

    const allSpaces = input.allSpaces ?? existing.allSpaces;
    const spacesTouched = input.allSpaces !== undefined || input.spaceIds !== undefined;
    const ids = spacesTouched
      ? await this.resolveSpaces(allSpaces, input.spaceIds, tenantId)
      : null;
    if (spacesTouched) {
      await this.assertNoRatioOverlap(allSpaces, ids ?? [], tenantId, id);
    }

    const ratio = await this.prisma.$transaction(async (tx) => {
      if (spacesTouched) {
        await tx.hrStaffRatioSpace.deleteMany({ where: { ratioId: id } });
      }
      return tx.hrStaffRatio.update({
        where: { id },
        data: {
          ...(input.staffPerZoneManager !== undefined && {
            staffPerZoneManager: input.staffPerZoneManager,
          }),
          ...(input.allSpaces !== undefined && { allSpaces }),
          ...(spacesTouched && { spaces: { create: (ids ?? []).map((spaceId) => ({ spaceId })) } }),
        },
        include: { spaces: { select: { spaceId: true } } },
      });
    });
    return this.mapRatio(ratio);
  }

  async removeStaffRatio(id: string, tenantId: string) {
    const existing = await this.prisma.hrStaffRatio.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrStaffRatio ${id} introuvable`);
    await this.prisma.hrStaffRatio.delete({ where: { id } }); // cascade sur HrStaffRatioSpace
    return { deleted: true };
  }
}
