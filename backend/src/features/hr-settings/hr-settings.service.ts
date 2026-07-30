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
