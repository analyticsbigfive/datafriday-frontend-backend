import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { SinkingRuleInput, DEFAULT_OFFSET_OPEN_MINUTES, DEFAULT_OFFSET_CLOSE_MINUTES } from '../staffing-calculator.service';
import {
  parseEventSessions,
  combineDayAndLocalTime,
  DEFAULT_EVENT_DURATION_HOURS,
} from '../../../shared/utils/event-window.util';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

interface EventContext {
  event: any;
  configId: string;
  spaceId: string;
  /** Fenêtre suggérée des lignes : portes ± offsets (−2 h / +2 h par défaut). */
  lineStart: Date;
  lineEnd: Date;
  /** `Space.timezone` (défaut Europe/Paris) — le frontend en a besoin pour afficher les
   * horaires en heure LOCALE DU LIEU plutôt qu'en heure locale du navigateur (BUG-270). */
  timezone: string;
}

const ASSERT_SPACE_ACCESS_DENIED = "Vous n'avez pas accès à l'espace de cet événement.";

/**
 * Contexte du calcul de staffing : événement et PDV, réglages, CA prévu par élément, référentiel RH et choix d'affectation.
 */
@Injectable()
export class StaffingContextService {
  constructor(
    private prisma: PrismaService,
    private spaceAccess: SpaceAccessService,
  ) {}

  // ── Contexte événement ─────────────────────────────────────────────────────

  async getEventContext(eventId: string, tenantId: string, user?: SpaceScopedUser): Promise<EventContext> {
    const event = await this.prisma.event.findFirst({ where: { id: eventId } });
    if (!event || (event.tenantId && event.tenantId !== tenantId)) {
      throw new NotFoundException(`Événement ${eventId} introuvable`);
    }
    await this.spaceAccess.assertCanAccessSpace(user, event.spaceId, ASSERT_SPACE_ACCESS_DENIED);
    if (!event.configurationId) {
      throw new BadRequestException("L'événement n'a pas de configuration associée.");
    }
    if (!event.spaceId) {
      throw new BadRequestException("L'événement n'a pas d'espace associé.");
    }
    const space = await this.prisma.space.findFirst({ where: { id: event.spaceId }, select: { timezone: true } });
    const timezone = space?.timezone || 'Europe/Paris';

    // `eventStartDate`/`eventEndDate`/`eventDate` ne portent qu'un jour calendaire (minuit,
    // sans heure) — la vraie heure de « portes » vient de `sessions[0].doorsOpening` (retour
    // utilisateur 2026-08-04 : Session 1 → dernière session, une seule fenêtre de staff pour
    // tout l'event) et la vraie heure de fin de `eventEndTime`, repli sur le `showTime` de la
    // dernière session si absent. Repli final sur le jour calendaire brut si aucune heure
    // n'est renseignée (comportement historique, préférable à une exception bloquante).
    const startDay: Date = event.eventStartDate ?? event.eventDate;
    const endDay: Date = event.eventEndDate ?? startDay;
    const sessions = parseEventSessions(event.sessions);
    const doorsOpen = combineDayAndLocalTime(startDay, sessions[0]?.doorsOpening, timezone) ?? startDay;
    const doorsClose =
      combineDayAndLocalTime(endDay, event.eventEndTime ?? sessions[sessions.length - 1]?.showTime, timezone) ??
      new Date(doorsOpen.getTime() + DEFAULT_EVENT_DURATION_HOURS * 3_600_000);
    return {
      event,
      configId: event.configurationId,
      spaceId: event.spaceId,
      lineStart: new Date(doorsOpen.getTime() + DEFAULT_OFFSET_OPEN_MINUTES * 60_000),
      lineEnd: new Date(doorsClose.getTime() + DEFAULT_OFFSET_CLOSE_MINUTES * 60_000),
      timezone,
    };
  }

  // ── Résolution des settings RH (miroir de frontend utils/hrSettings.js) ────
  // Règle : ligne rattachée à l'espace > ligne « TOUS » (allSpaces) ; en cas de
  // doublon, la plus récente (createdAt) gagne.

  async resolveSettings(spaceId: string, tenantId: string) {
    const [goals, ratios] = await this.prisma.$transaction([
      this.prisma.hrGoal.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { spaces: { select: { spaceId: true } } },
      }),
      this.prisma.hrStaffRatio.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { spaces: { select: { spaceId: true } } },
      }),
    ]);
    const pick = <T extends { allSpaces: boolean; spaces: { spaceId: string }[] }>(rows: T[]) =>
      rows.find((r) => r.spaces.some((s) => s.spaceId === spaceId)) ?? rows.find((r) => r.allSpaces) ?? null;
    const goal = pick(goals);
    const ratio = pick(ratios);
    return {
      goalTpe: goal ? (goal as any).goalPerTpe : null,
      staffPerZoneManager: ratio ? (ratio as any).staffPerZoneManager : null,
    };
  }

  /**
   * CA prédictif par PDV (#43, 11_RH_STAFFING.md §11.15 option b) : agrège
   * `EventPredictVersion.predictedRecords` (grain shopId × menuItem, déjà ajusté par les
   * sliders du scénario — cf. `buildPredictedRecords` frontend) par `shopId`, pour la version
   * marquée `isDefault` de l'event. Map vide si l'event n'a pas de version par défaut —
   * l'appelant se replie alors sur `ElementPerformance.revenue`.
   */
  async resolvePredictedRevenueByElement(
    eventId: string,
    tenantId: string,
  ): Promise<Map<string, number>> {
    const version = await this.prisma.eventPredictVersion.findFirst({
      where: { eventId, tenantId, isDefault: true },
      select: { predictedRecords: true },
    });
    const records = Array.isArray(version?.predictedRecords) ? (version!.predictedRecords as any[]) : [];
    const byElement = new Map<string, number>();
    for (const rec of records) {
      const shopId = rec?.shopId;
      const revenue = Number(rec?.totalRevenue);
      if (!shopId || !Number.isFinite(revenue)) continue;
      byElement.set(shopId, (byElement.get(shopId) ?? 0) + revenue);
    }
    return byElement;
  }

  /**
   * BUG-391-02 : CA prédit par PDV envoyé par l'écran Event Predict (celui que l'utilisateur
   * voit). Ne garde que les nombres finis ≥ 0 ; le reste est ignoré sans erreur. Map vide si
   * rien d'exploitable : l'appelant retombe alors sur la version par défaut.
   */
  sanitizeRevenueOverride(override?: Record<string, unknown> | null): Map<string, number> {
    const byElement = new Map<string, number>();
    if (!override || typeof override !== 'object' || Array.isArray(override)) return byElement;
    for (const [elementId, raw] of Object.entries(override)) {
      if (!elementId || raw === null || raw === '' || typeof raw === 'boolean') continue;
      const revenue = Number(raw);
      if (!Number.isFinite(revenue) || revenue < 0) continue;
      byElement.set(elementId, revenue);
    }
    return byElement;
  }

  /**
   * Montant en euros au format français, 2 décimales au plus (ex. « 1 000 », « 999,6 »),
   * espaces insécables normalisés. Pas d'arrondi à l'entier : 999,6 ne doit pas s'afficher 1 000.
   */
  formatEuros(value: number): string {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value).replace(/\s/g, ' ');
  }

  // ── Chargement du référentiel RH ───────────────────────────────────────────

  async loadHrContext(tenantId: string, spaceId: string) {
    const [roles, persons, defaults, suppliers, sinkingRules, menuItemRatios] = await this.prisma.$transaction([
      this.prisma.hrRole.findMany({
        where: { tenantId },
        include: {
          suppliers: { select: { supplierId: true, supplier: { select: { spaceIds: true } } } },
        },
      }),
      this.prisma.hrPerson.findMany({ where: { tenantId, active: true } }),
      this.prisma.hrRoleSpaceDefault.findMany({ where: { spaceId } }),
      this.prisma.hrSupplier.findMany({ where: { tenantId } }),
      this.prisma.hrSinkingRule.findMany({ where: { tenantId } }),
      // Associations Rôle↔MenuItem (11_RH_STAFFING.md §11.16), scopées par espace (contrairement
      // aux Sinking Rules qui sont tenant-wide/tag-scopées).
      this.prisma.hrRoleMenuItemRatio.findMany({ where: { tenantId, spaceId } }),
    ]);
    const rolesByAlgo = new Map<string, any>();
    const rolesById = new Map<string, any>();
    for (const r of roles) {
      rolesById.set(r.id, r);
      if (r.algoKey) rolesByAlgo.set(r.algoKey, r);
    }
    const personsByRole = new Map<string, { CDI: any[]; CDD: any[] }>();
    for (const p of persons) {
      const bucket = personsByRole.get(p.roleId) ?? { CDI: [], CDD: [] };
      if (p.contractType === 'CDI') bucket.CDI.push(p);
      else if (p.contractType === 'CDD') bucket.CDD.push(p);
      personsByRole.set(p.roleId, bucket);
    }
    const defaultSupplierByRole = new Map<string, string>();
    for (const d of defaults) defaultSupplierByRole.set(d.roleId, d.supplierId);
    const suppliersById = new Map<string, any>(suppliers.map((s) => [s.id, s]));
    return {
      rolesByAlgo,
      rolesById,
      personsByRole,
      defaultSupplierByRole,
      suppliersById,
      sinkingRules: sinkingRules as SinkingRuleInput[],
      menuItemRatios,
    };
  }

  /**
   * Présélection fournisseur d'une ligne (ordre STRICT spec §3.3) :
   * HrPerson active CDI → CDD → agence par défaut de l'espace pour ce rôle →
   * première agence du rôle. `index` distribue les personnes disponibles
   * (une personne = une ligne, Q7 : « disponible » contrôlé par event).
   */
  pickAssignment(
    role: any | null,
    index: number,
    hr: Awaited<ReturnType<StaffingContextService['loadHrContext']>>,
    spaceId: string,
  ): {
    supplierType: string | null;
    supplierId: string | null;
    personId: string | null;
    personLabel: string | null;
    rateOverride: number | null;
  } {
    const none = { supplierType: null, supplierId: null, personId: null, personLabel: null, rateOverride: null };
    if (!role) return none;
    const pool = hr.personsByRole.get(role.id) ?? { CDI: [], CDD: [] };
    if (index < pool.CDI.length) {
      const p = pool.CDI[index];
      return {
        supplierType: 'CDI',
        supplierId: null,
        personId: p.id,
        personLabel: `${p.firstName} ${p.lastName}`,
        rateOverride: p.hourlyRate ?? null,
      };
    }
    const cddIndex = index - pool.CDI.length;
    if (cddIndex < pool.CDD.length) {
      const p = pool.CDD[cddIndex];
      return {
        supplierType: 'CDD',
        supplierId: null,
        personId: p.id,
        personLabel: `${p.firstName} ${p.lastName}`,
        rateOverride: p.hourlyRate ?? null,
      };
    }
    // Aucune Personne dispo pour ce rôle : la Position (HrRole.contractType) devient le
    // défaut de la ligne plutôt qu'un repli silencieux sur Agence (retour utilisateur
    // 2026-08-04) — seul contractType='AGENCY' déclenche la résolution d'agence ci-dessous.
    if (role.contractType && role.contractType !== 'AGENCY') {
      return { ...none, supplierType: role.contractType };
    }
    // "Espaces" de l'Agence (HrSupplier.spaceIds, 2026-08-04) : n'est éligible au repli
    // automatique qu'une agence sans restriction déclarée (liste vide) ou couvrant CET
    // espace — évite de proposer une agence configurée pour un autre espace. Liste vide =
    // pas de restriction déclarée par le tenant, éligible partout (ce champ était jusque-là
    // purement décoratif, aucune agence existante ne l'avait renseigné).
    const eligibleSupplierId = (role.suppliers ?? []).find(
      (rs: any) => !rs.supplier?.spaceIds?.length || rs.supplier.spaceIds.includes(spaceId),
    )?.supplierId as string | undefined;
    const defaultSupplierId = hr.defaultSupplierByRole.get(role.id) ?? eligibleSupplierId;
    if (defaultSupplierId) {
      const supplier = hr.suppliersById.get(defaultSupplierId);
      return {
        supplierType: 'AGENCY',
        supplierId: defaultSupplierId,
        personId: null,
        personLabel: supplier?.name ?? null,
        rateOverride: null,
      };
    }
    return { ...none, supplierType: 'AGENCY' };
  }
}
