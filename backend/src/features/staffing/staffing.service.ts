import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { StaffingCalculatorService, StaffingWarning } from './staffing-calculator.service';
import { StaffingContextService } from './services/staffing-context.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/** front (base RZ) = rpdv + caissiers + runners + barman. */
const FRONT_ALGO_KEYS = ['RESPONSABLE_PDV', 'CAISSIER', 'RUNNER', 'BARMAN'];

const ASSERT_SPACE_ACCESS_DENIED = "Vous n'avez pas accès à l'espace de cet événement.";

/**
 * Staffing d'un événement : lecture, lignes ajoutées, modifiées ou retirées, coûts par espace.
 */
@Injectable()
export class StaffingService {
  constructor(
    private prisma: PrismaService,
    private calculator: StaffingCalculatorService,
    private spaceAccess: SpaceAccessService,
    private readonly staffingContextService: StaffingContextService,
  ) {}

  // ── Lecture groupée (GET /events/:eventId/staffing) ───────────────────────

  async getStaffing(eventId: string, tenantId: string, extraWarnings: StaffingWarning[] = [], user?: SpaceScopedUser) {
    const ctx = await this.staffingContextService.getEventContext(eventId, tenantId, user);
    const settings = await this.staffingContextService.resolveSettings(ctx.spaceId, tenantId);
    const warnings: StaffingWarning[] = [...extraWarnings];

    let lines = await this.prisma.eventStaffLine.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: {
        role: { select: { name: true, algoKey: true } },
        person: { select: { firstName: true, lastName: true } },
        supplier: { select: { name: true } },
      },
    });

    // Les horaires d'une ligne ALGO non modifiée par l'utilisateur SUIVENT la fenêtre
    // suggérée (portes − 2 h → fin + offset). Ils étaient figés à la génération : après
    // une édition des heures de l'event (ouverture des portes renseignée après coup, fin
    // décalée), les lignes gardaient l'ancienne plage (ex. 00:00 → 01:50 quand aucune heure
    // n'était connue) alors que la fenêtre affichée avait bougé (retour Bertrand 2026-09-17).
    // On les recale ici, en base, pour que coûts et curseurs restent cohérents ; une ligne
    // MANUAL ou userModified n'est jamais touchée.
    // Une ligne MANUAL ou userModified garde ses horaires, mais reste CONTENUE dans la
    // fenêtre : une ligne réglée à la main quand la fenêtre allait de 00:00 à 01:50 (aucune
    // heure de portes connue) débordait de la nouvelle plage, et le curseur (borné à la
    // fenêtre) affichait un segment hors piste jusqu'au premier mouvement.
    const realigned = new Map<string, { startTime: Date; endTime: Date }>();
    for (const l of lines) {
      let next: { startTime: Date; endTime: Date } | null = null;
      if (l.source === 'ALGO' && !l.userModified) {
        next = { startTime: ctx.lineStart, endTime: ctx.lineEnd };
      } else {
        const start = new Date(Math.max(l.startTime.getTime(), ctx.lineStart.getTime()));
        const end = new Date(Math.min(l.endTime.getTime(), ctx.lineEnd.getTime()));
        next = end > start ? { startTime: start, endTime: end } : { startTime: ctx.lineStart, endTime: ctx.lineEnd };
      }
      if (
        next.startTime.getTime() !== l.startTime.getTime() ||
        next.endTime.getTime() !== l.endTime.getTime()
      ) {
        realigned.set(l.id, next);
      }
    }
    if (realigned.size) {
      await this.prisma.$transaction(
        [...realigned].map(([id, data]) => this.prisma.eventStaffLine.update({ where: { id }, data })),
      );
      lines = lines.map((l) => (realigned.has(l.id) ? { ...l, ...realigned.get(l.id)! } : l));
    }

    const elementIds = Array.from(new Set(lines.map((l) => l.elementId)));
    const [elements, perfs] = await this.prisma.$transaction([
      this.prisma.spaceElement.findMany({
        where: { id: { in: elementIds } },
        select: { id: true, name: true, type: true },
      }),
      this.prisma.elementPerformance.findMany({
        where: { configId: ctx.configId, elementId: { in: elementIds } },
      }),
    ]);
    const elementById = new Map(elements.map((e) => [e.id, e]));
    const perfByElement = new Map(perfs.map((p) => [p.elementId, p]));

    const groups = new Map<string, any>();
    let frontEnabled = 0;
    for (const l of lines) {
      const g = groups.get(l.elementId) ?? {
        elementId: l.elementId,
        elementName: elementById.get(l.elementId)?.name ?? l.elementId,
        elementType: elementById.get(l.elementId)?.type ?? null,
        peakTxParMin: perfByElement.get(l.elementId)?.transactionsPerMinute ?? 0,
        predictedCost: this.calculator.round2(perfByElement.get(l.elementId)?.staffCost ?? 0),
        adjustedCost: 0,
        lines: [],
      };
      const cost = this.calculator.lineCost(l.hourlyRate, l.startTime, l.endTime);
      if (l.enabled) {
        g.adjustedCost += cost;
        if (l.algoKey && FRONT_ALGO_KEYS.includes(l.algoKey)) frontEnabled++;
      }
      g.lines.push({
        id: l.id,
        roleId: l.roleId,
        roleName: l.role?.name ?? null,
        algoKey: l.algoKey,
        enabled: l.enabled,
        source: l.source,
        userModified: l.userModified,
        supplierType: l.supplierType,
        supplierId: l.supplierId,
        supplierName: l.supplier?.name ?? null,
        personId: l.personId,
        personLabel:
          l.personLabel ?? (l.person ? `${l.person.firstName} ${l.person.lastName}` : null),
        hourlyRate: l.hourlyRate,
        startTime: l.startTime,
        endTime: l.endTime,
        totalCost: this.calculator.round2(cost),
      });
      groups.set(l.elementId, g);
    }

    // Coût RZ : rz × taux RZ × amplitude zone (§5)
    const rz =
      settings.staffPerZoneManager !== null
        ? this.calculator.zoneManagers(frontEnabled, settings.staffPerZoneManager)
        : 0;
    const rzRole = await this.prisma.hrRole.findFirst({
      where: { tenantId, algoKey: 'RESPONSABLE_ZONE' },
    });
    const rzRate = rzRole ? (this.calculator.hourlyRateFrom(rzRole.rateType, rzRole.rate) ?? 0) : 0;
    if (rz > 0 && !rzRole) {
      warnings.push({
        code: 'ROLE_A_CONFIGURER',
        message: "Aucun rôle RH ne porte l'algoKey RESPONSABLE_ZONE — coût RZ compté à 0.",
      });
    }
    const amplitudeHours = (ctx.lineEnd.getTime() - ctx.lineStart.getTime()) / 3_600_000;
    const rzCost = rz * rzRate * amplitudeHours;

    const elementsOut = Array.from(groups.values()).map((g) => ({
      ...g,
      adjustedCost: this.calculator.round2(g.adjustedCost),
    }));
    const predictedTotal = elementsOut.reduce((s, g) => s + g.predictedCost, 0) + rzCost;
    const adjustedTotal = elementsOut.reduce((s, g) => s + g.adjustedCost, 0) + rzCost;

    return {
      eventId,
      settings: { ...settings, spaceId: ctx.spaceId },
      schedule: { startTime: ctx.lineStart, endTime: ctx.lineEnd, timezone: ctx.timezone },
      elements: elementsOut,
      totals: {
        predictedCost: this.calculator.round2(predictedTotal),
        adjustedCost: this.calculator.round2(adjustedTotal),
        zoneManagers: rz,
        zoneManagerRate: rzRate,
        zoneManagerCost: this.calculator.round2(rzCost),
      },
      warnings,
    };
  }

  // ── Mutations de lignes ────────────────────────────────────────────────────

  async patchLine(id: string, input: any, tenantId: string, user?: SpaceScopedUser) {
    const line = await this.prisma.eventStaffLine.findFirst({
      where: { id, tenantId },
      include: { event: { select: { spaceId: true } } },
    });
    if (!line) throw new NotFoundException(`Ligne de staff ${id} introuvable`);
    await this.spaceAccess.assertCanAccessSpace(user, line.event?.spaceId, ASSERT_SPACE_ACCESS_DENIED);
    const startTime = input.startTime !== undefined ? new Date(input.startTime) : line.startTime;
    const endTime = input.endTime !== undefined ? new Date(input.endTime) : line.endTime;
    if (endTime <= startTime) {
      throw new BadRequestException("L'heure de fin doit être postérieure à l'heure de début.");
    }
    const updated = await this.prisma.eventStaffLine.update({
      where: { id },
      data: {
        ...(input.enabled !== undefined && { enabled: !!input.enabled }),
        ...(input.roleId !== undefined && { roleId: input.roleId }),
        ...(input.supplierType !== undefined && { supplierType: input.supplierType }),
        ...(input.supplierId !== undefined && { supplierId: input.supplierId }),
        ...(input.personId !== undefined && { personId: input.personId }),
        ...(input.personLabel !== undefined && { personLabel: input.personLabel }),
        ...(input.hourlyRate !== undefined && { hourlyRate: input.hourlyRate }),
        ...(input.startTime !== undefined && { startTime }),
        ...(input.endTime !== undefined && { endTime }),
        userModified: true, // jamais écrasée par une régénération
      },
    });
    return updated;
  }

  async addLine(eventId: string, input: any, tenantId: string, user?: SpaceScopedUser) {
    const ctx = await this.staffingContextService.getEventContext(eventId, tenantId, user);
    const element = await this.prisma.spaceElement.findFirst({ where: { id: input.elementId } });
    if (!element) throw new BadRequestException(`PDV ${input.elementId} introuvable`);
    let hourlyRate = input.hourlyRate;
    let role: any = null;
    if (input.roleId) {
      role = await this.prisma.hrRole.findFirst({ where: { id: input.roleId, tenantId } });
      if (!role) throw new BadRequestException(`Rôle ${input.roleId} introuvable`);
      if (hourlyRate === undefined || hourlyRate === null) {
        hourlyRate = this.calculator.hourlyRateFrom(role.rateType, role.rate) ?? 0;
      }
    }
    const hr = await this.staffingContextService.loadHrContext(tenantId, ctx.spaceId);
    const assignment = this.staffingContextService.pickAssignment(role, 0, hr, ctx.spaceId);
    return this.prisma.eventStaffLine.create({
      data: {
        tenantId,
        eventId,
        elementId: input.elementId,
        roleId: role?.id ?? null,
        algoKey: null, // ajout manuel
        enabled: true,
        source: 'MANUAL',
        userModified: false,
        supplierType: input.supplierType ?? assignment.supplierType,
        supplierId: input.supplierId ?? assignment.supplierId,
        personId: input.personId ?? assignment.personId,
        personLabel: input.personLabel ?? assignment.personLabel,
        hourlyRate: hourlyRate ?? 0,
        startTime: input.startTime ? new Date(input.startTime) : ctx.lineStart,
        endTime: input.endTime ? new Date(input.endTime) : ctx.lineEnd,
      },
    });
  }

  async removeLine(id: string, tenantId: string, user?: SpaceScopedUser) {
    const line = await this.prisma.eventStaffLine.findFirst({
      where: { id, tenantId },
      include: { event: { select: { spaceId: true } } },
    });
    if (!line) throw new NotFoundException(`Ligne de staff ${id} introuvable`);
    await this.spaceAccess.assertCanAccessSpace(user, line.event?.spaceId, ASSERT_SPACE_ACCESS_DENIED);
    if (line.source !== 'MANUAL') {
      throw new BadRequestException(
        'Seules les lignes ajoutées manuellement peuvent être supprimées — décochez la ligne pour l’exclure du coût.',
      );
    }
    await this.prisma.eventStaffLine.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Agrégat coûts par espace (GET /hr-settings/costs, cartes HrSettingsView) ──

  async costsBySpace(tenantId: string, spaceId?: string, user?: SpaceScopedUser) {
    let spaceScope: any = {};
    if (spaceId) {
      spaceScope = { event: { spaceId } };
    } else if (user && !this.spaceAccess.hasFullAccess(user)) {
      const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
      if (accessible !== 'ALL') {
        // Un event sans spaceId est un artefact de démappage/import (pas un event
        // « global ») — un utilisateur restreint ne voit que les coûts de ses espaces.
        spaceScope = { event: { spaceId: { in: accessible } } };
      }
    }
    const lines = await this.prisma.eventStaffLine.findMany({
      where: {
        tenantId,
        enabled: true,
        ...spaceScope,
      },
      select: {
        hourlyRate: true,
        startTime: true,
        endTime: true,
        eventId: true,
        event: { select: { spaceId: true } },
      },
    });
    const bySpace = new Map<string, { totalCost: number; eventIds: Set<string> }>();
    for (const l of lines) {
      const sid = l.event?.spaceId ?? 'unknown';
      const agg = bySpace.get(sid) ?? { totalCost: 0, eventIds: new Set<string>() };
      agg.totalCost += this.calculator.lineCost(l.hourlyRate, l.startTime, l.endTime);
      agg.eventIds.add(l.eventId);
      bySpace.set(sid, agg);
    }
    return {
      data: Array.from(bySpace.entries()).map(([sid, agg]) => ({
        spaceId: sid,
        totalCost: this.calculator.round2(agg.totalCost),
        eventCount: agg.eventIds.size,
        avgPerEvent: this.calculator.round2(agg.eventIds.size ? agg.totalCost / agg.eventIds.size : 0),
      })),
    };
  }
}
