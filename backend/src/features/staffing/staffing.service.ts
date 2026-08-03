import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import {
  StaffingCalculatorService,
  StaffingWarning,
  AlgoKey,
  SinkingRuleInput,
  DEFAULT_TX_PAR_SECONDE,
  DEFAULT_OFFSET_OPEN_MINUTES,
  DEFAULT_OFFSET_CLOSE_MINUTES,
} from './staffing-calculator.service';
import { detectFnbTags } from './fnb-tags.util';

/**
 * Orchestration du staffing par événement (spec §1.3) :
 * charge event + PDV (SpaceElement de la config) + ElementPerformance (CA
 * prédictif, tx/min) + settings RH résolus (HrGoal/HrStaffRatio) + rôles RH →
 * appelle le calculateur pur → upsert des EventStaffLine source='ALGO'.
 * Une ligne MANUAL ou userModified n'est JAMAIS écrasée par une régénération
 * (elle compte dans le quota de son rôle).
 * Le coût PRÉDIT (figé) est stocké dans ElementPerformance.staffCost ; le coût
 * AJUSTÉ se recalcule depuis les lignes enabled (§5).
 */

/** Types d'éléments considérés comme PDV pour le staffing (hypothèse, cf. rapport). */
export const STAFFING_ELEMENT_TYPES = ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack'];

/** Fallback si l'événement n'a pas de date de fin (hypothèse, cf. rapport). */
export const DEFAULT_EVENT_DURATION_HOURS = 6;
/** front (base RZ) = rpdv + caissiers + runners + barman. */
const FRONT_ALGO_KEYS = ['RESPONSABLE_PDV', 'CAISSIER', 'RUNNER', 'BARMAN'];

const ALGO_COUNT_FIELDS: Array<{ key: AlgoKey; field: string }> = [
  { key: 'RESPONSABLE_PDV', field: 'rpdv' },
  { key: 'CAISSIER', field: 'caissiers' },
  { key: 'RUNNER', field: 'runners' },
  { key: 'BARMAN', field: 'barman' },
  { key: 'CHEF_DE_PARTIE', field: 'chefDePartie' },
  { key: 'COMMIS', field: 'commis' },
  { key: 'EPR', field: 'epr' },
];

interface EventContext {
  event: any;
  configId: string;
  spaceId: string;
  /** Fenêtre suggérée des lignes : portes ± offsets (−1 h / +1 h par défaut). */
  lineStart: Date;
  lineEnd: Date;
}

@Injectable()
export class StaffingService {
  constructor(
    private prisma: PrismaService,
    private calculator: StaffingCalculatorService,
  ) {}

  // ── Contexte événement ─────────────────────────────────────────────────────

  private async getEventContext(eventId: string, tenantId: string): Promise<EventContext> {
    const event = await this.prisma.event.findFirst({ where: { id: eventId } });
    if (!event || (event.tenantId && event.tenantId !== tenantId)) {
      throw new NotFoundException(`Événement ${eventId} introuvable`);
    }
    if (!event.configurationId) {
      throw new BadRequestException("L'événement n'a pas de configuration associée.");
    }
    if (!event.spaceId) {
      throw new BadRequestException("L'événement n'a pas d'espace associé.");
    }
    const doorsOpen: Date = event.eventStartDate ?? event.eventDate;
    const doorsClose: Date =
      event.eventEndDate ?? new Date(doorsOpen.getTime() + DEFAULT_EVENT_DURATION_HOURS * 3_600_000);
    return {
      event,
      configId: event.configurationId,
      spaceId: event.spaceId,
      lineStart: new Date(doorsOpen.getTime() + DEFAULT_OFFSET_OPEN_MINUTES * 60_000),
      lineEnd: new Date(doorsClose.getTime() + DEFAULT_OFFSET_CLOSE_MINUTES * 60_000),
    };
  }

  // ── Résolution des settings RH (miroir de frontend utils/hrSettings.js) ────
  // Règle : ligne rattachée à l'espace > ligne « TOUS » (allSpaces) ; en cas de
  // doublon, la plus récente (createdAt) gagne.

  private async resolveSettings(spaceId: string, tenantId: string) {
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

  // ── Chargement du référentiel RH ───────────────────────────────────────────

  private async loadHrContext(tenantId: string, spaceId: string) {
    const [roles, persons, defaults, suppliers, sinkingRules, menuItemRatios] = await this.prisma.$transaction([
      this.prisma.hrRole.findMany({
        where: { tenantId },
        include: { suppliers: { select: { supplierId: true } } },
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
  private pickAssignment(
    role: any | null,
    index: number,
    hr: Awaited<ReturnType<StaffingService['loadHrContext']>>,
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
    const defaultSupplierId =
      hr.defaultSupplierByRole.get(role.id) ?? (role.suppliers?.[0]?.supplierId as string | undefined);
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

  // ── Génération (POST /events/:eventId/staffing/generate) ──────────────────

  async generate(eventId: string, tenantId: string) {
    const ctx = await this.getEventContext(eventId, tenantId);
    const settings = await this.resolveSettings(ctx.spaceId, tenantId);
    if (settings.goalTpe === null) {
      throw new BadRequestException('Aucun goal TPE configuré (Settings RH) pour cet espace.');
    }
    if (settings.staffPerZoneManager === null) {
      throw new BadRequestException(
        'Aucun ratio staff par Responsable de zone configuré (Settings RH) pour cet espace.',
      );
    }
    const hr = await this.loadHrContext(tenantId, ctx.spaceId);

    const elements = await this.prisma.spaceElement.findMany({
      where: {
        type: { in: STAFFING_ELEMENT_TYPES as any },
        configurationElements: { some: { configId: ctx.configId } },
      },
      include: {
        performances: { where: { configId: ctx.configId } },
        // Saisie manuelle "vendu/prévu" par Menu Item (11_RH_STAFFING.md §11.16), source des
        // associations Rôle↔MenuItem (hr.menuItemRatios) évaluées plus bas dans la boucle.
        menuItemSalesInputs: { where: { configId: ctx.configId } },
      },
    });

    const existing = await this.prisma.eventStaffLine.findMany({ where: { eventId } });
    const suggestedHours = (ctx.lineEnd.getTime() - ctx.lineStart.getTime()) / 3_600_000;
    const warnedRoles = new Set<string>();
    const globalWarnings: StaffingWarning[] = [];

    // Génération « silencieuse » (BUG-258-01 frontend) : un 201 avec elements: [] est
    // indiscernable d'un no-op côté UI — on explique pourquoi rien n'a été créé.
    if (elements.length === 0) {
      globalWarnings.push({
        code: 'AUCUN_ELEMENT_STAFFABLE',
        message:
          'Aucun point de vente staffable (shop/F&B) rattaché à la configuration de cet event — rien à générer.',
      });
    }
    let totalCreated = 0;
    let totalKept = 0;

    for (const el of elements) {
      const perf = el.performances[0];
      const attrs = ((el as any).attributes ?? {}) as Record<string, any>;
      // BUG-122 : sous-types Builder v2 en minuscules (beverages, front_food…) — voir
      // fnb-tags.util.ts. CFG-2 Étape 4.5 : ce sont désormais aussi les valeurs stockées dans
      // HrRole.fnbCategories/HrSinkingRule.fnbCategory (Subtype.code, plus d'UPPERCASE_SNAKE).
      const fnbTags = detectFnbTags((el as any).subtypes);
      const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);

      const result = this.calculator.calculate({
        caPredictif: perf?.revenue ?? 0,
        goalTpe: settings.goalTpe,
        // 2026-08-02, retour utilisateur : la donnée existe déjà sur l'élément (Position >
        // Largeur) — plus de champ « Mètres linéaires » dédié dans le Builder (StaffingInputsSection).
        metresLineaires: num((el as any).width),
        ouvertureObligatoire: attrs.ouvertureObligatoire === true,
        peakTxParMin: perf?.transactionsPerMinute ?? 0,
        txParSeconde: num(attrs.txParSeconde) ?? DEFAULT_TX_PAR_SECONDE,
        hasResponsablePdv: attrs.hasResponsablePdv === true,
        // BEER/DRINKEE regroupés ici avec BEVERAGE pour préserver le comportement déjà
        // testé de la formule (2026-07-30) — seul le tagging de rôle RH distingue
        // désormais les 3 catégories finement (cf. fnb-tags.util.ts).
        hasBeverage:
          el.type === 'fnb_beverages' ||
          fnbTags.has('beverages') ||
          fnbTags.has('beer') ||
          fnbTags.has('drinkee'),
        nbTireuses: num(attrs.nbTireuses) ?? 0,
        hasFrontFood: el.type === 'fnb_food' || el.type === 'fnb_snack' || fnbTags.has('front_food'),
        nbFriteuses: num(attrs.nbFriteuses) ?? 0,
        nbDinettes: num(attrs.nbDinettes) ?? 0,
        // 2026-08-02, retour utilisateur : quantités PRÉVUES POUR UN EVENT (pas un attribut fixe
        // du PDV) — plus de champ Builder dédié. Restent à 0 tant qu'un branchement réel sur les
        // quantités prédites par Event Predict n'est pas fait ; cela nécessite une classification
        // burger/hot-dog des MenuItem qui n'existe pas encore dans le modèle (question ouverte,
        // cf. QUESTIONS_A_BERTRAND.md). SpaceElement.attributes.nbHotdogsPrevus reste néanmoins lu
        // tel quel comme condition Sinking Rule (cf. applySinkingRules ci-dessous) — indépendant
        // de ce calcul par paliers.
        nbBurgersPrevus: 0,
        nbHotdogsPrevus: 0,
        hasMixology: el.type === 'fnb_bar' || fnbTags.has('mixology'),
        hasKitchenFood: fnbTags.has('kitchen_food'),
      });

      const existingForEl = existing.filter((l) => l.elementId === el.id);
      const kept = existingForEl.filter((l) => l.source === 'MANUAL' || l.userModified);
      const deletableIds = existingForEl
        .filter((l) => l.source === 'ALGO' && !l.userModified)
        .map((l) => l.id);

      const creations: any[] = [];
      let predictedCost = 0;

      for (const { key, field } of ALGO_COUNT_FIELDS) {
        const count = (result as any)[field] as number;
        if (count <= 0) continue;
        const role = hr.rolesByAlgo.get(key) ?? null;
        const defaultRate = role
          ? (this.calculator.hourlyRateFrom(role.rateType, role.rate) ?? 0)
          : 0;
        // Coût prédit figé : taux DÉFAUT du rôle × durée suggérée, pour l'effectif complet (§5).
        predictedCost += count * defaultRate * suggestedHours;
        if (!role && !warnedRoles.has(key)) {
          warnedRoles.add(key);
          globalWarnings.push({
            code: 'ROLE_A_CONFIGURER',
            message: `Aucun rôle RH ne porte l'algoKey ${key} — rôle à configurer dans Settings RH.`,
          });
        }
        const keptCount = kept.filter((l) => l.source === 'ALGO' && l.algoKey === key).length;
        for (let i = keptCount; i < count; i++) {
          const assignment = this.pickAssignment(role, i, hr);
          creations.push({
            tenantId,
            eventId,
            elementId: el.id,
            roleId: role?.id ?? null,
            algoKey: key,
            enabled: true,
            source: 'ALGO',
            userModified: false,
            supplierType: assignment.supplierType,
            supplierId: assignment.supplierId,
            personId: assignment.personId,
            personLabel: assignment.personLabel,
            hourlyRate: assignment.rateOverride ?? defaultRate,
            startTime: ctx.lineStart,
            endTime: ctx.lineEnd,
          });
        }
      }

      // Règles Sinking RH (STF-2) : quota minimal forcé par rôle, en SUPPLÉMENT
      // du calcul par paliers ci-dessus. Lignes ALGO, algoKey=null, roleId renseigné.
      const sinkingOutcomes = this.calculator.applySinkingRules(fnbTags, attrs, hr.sinkingRules);
      for (const { roleId, qty } of sinkingOutcomes) {
        if (qty <= 0) continue;
        const role = hr.rolesById.get(roleId) ?? null;
        const defaultRate = role ? (this.calculator.hourlyRateFrom(role.rateType, role.rate) ?? 0) : 0;
        predictedCost += qty * defaultRate * suggestedHours;
        const keptCount = kept.filter(
          (l) => l.source === 'ALGO' && l.algoKey === null && l.roleId === roleId,
        ).length;
        for (let i = keptCount; i < qty; i++) {
          const assignment = this.pickAssignment(role, i, hr);
          creations.push({
            tenantId,
            eventId,
            elementId: el.id,
            roleId,
            algoKey: null,
            enabled: true,
            source: 'ALGO',
            userModified: false,
            supplierType: assignment.supplierType,
            supplierId: assignment.supplierId,
            personId: assignment.personId,
            personLabel: assignment.personLabel,
            hourlyRate: assignment.rateOverride ?? defaultRate,
            startTime: ctx.lineStart,
            endTime: ctx.lineEnd,
          });
        }
      }

      // Associations Rôle↔MenuItem (11_RH_STAFFING.md §11.16) : même principe que les Sinking
      // Rules ci-dessus (lignes ALGO, algoKey=null, roleId renseigné), mais SOMMÉES entre elles
      // par applyMenuItemRatios (pas de max) — scopées par espace, pas par tag F&B, donc évaluées
      // même si fnbTags est vide pour cet élément (une saisie manuelle nulle donne naturellement
      // qty=0, pas besoin d'un garde-fou supplémentaire).
      const sales = ((el as any).menuItemSalesInputs ?? []).map((s: any) => ({
        menuItemId: s.menuItemId,
        quantity: s.quantity ?? 0,
        revenueHt: s.revenueHt ?? 0,
      }));
      const ratioInputs = (hr.menuItemRatios ?? []).map((r: any) => ({
        roleId: r.roleId,
        ratioBasis: r.ratioBasis,
        ratioValue: r.ratioValue,
        unitQty: r.unitQty,
        targetMenuItemIds: r.allMenuItems ? sales.map((s: any) => s.menuItemId) : r.menuItemIds,
      }));
      const ratioOutcomes = this.calculator.applyMenuItemRatios(ratioInputs, sales);
      for (const { roleId, qty } of ratioOutcomes) {
        if (qty <= 0) continue;
        const role = hr.rolesById.get(roleId) ?? null;
        const defaultRate = role ? (this.calculator.hourlyRateFrom(role.rateType, role.rate) ?? 0) : 0;
        predictedCost += qty * defaultRate * suggestedHours;
        const keptCount = kept.filter(
          (l) => l.source === 'ALGO' && l.algoKey === null && l.roleId === roleId,
        ).length;
        for (let i = keptCount; i < qty; i++) {
          const assignment = this.pickAssignment(role, i, hr);
          creations.push({
            tenantId,
            eventId,
            elementId: el.id,
            roleId,
            algoKey: null,
            enabled: true,
            source: 'ALGO',
            userModified: false,
            supplierType: assignment.supplierType,
            supplierId: assignment.supplierId,
            personId: assignment.personId,
            personLabel: assignment.personLabel,
            hourlyRate: assignment.rateOverride ?? defaultRate,
            startTime: ctx.lineStart,
            endTime: ctx.lineEnd,
          });
        }
      }

      totalCreated += creations.length;
      totalKept += kept.length;

      await this.prisma.$transaction([
        this.prisma.eventStaffLine.deleteMany({ where: { id: { in: deletableIds } } }),
        ...(creations.length ? [this.prisma.eventStaffLine.createMany({ data: creations })] : []),
        // Coût prédit figé dans ElementPerformance.staffCost (champ existant, §5).
        this.prisma.elementPerformance.upsert({
          where: { elementId_configId: { elementId: el.id, configId: ctx.configId } },
          update: { staffCost: this.calculator.round2(predictedCost) },
          create: {
            elementId: el.id,
            configId: ctx.configId,
            staffCost: this.calculator.round2(predictedCost),
          },
        }),
      ]);
    }

    if (elements.length > 0 && totalCreated === 0 && totalKept === 0) {
      globalWarnings.push({
        code: 'AUCUNE_LIGNE_GENEREE',
        message:
          "La génération n'a produit aucune ligne : les effectifs calculés sont tous à 0 " +
          '(CA prédictif / pic de transactions absents pour les PDV de cette configuration).',
      });
    }

    return this.getStaffing(eventId, tenantId, globalWarnings);
  }

  // ── Lecture groupée (GET /events/:eventId/staffing) ───────────────────────

  async getStaffing(eventId: string, tenantId: string, extraWarnings: StaffingWarning[] = []) {
    const ctx = await this.getEventContext(eventId, tenantId);
    const settings = await this.resolveSettings(ctx.spaceId, tenantId);
    const warnings: StaffingWarning[] = [...extraWarnings];

    const lines = await this.prisma.eventStaffLine.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: {
        role: { select: { name: true, algoKey: true } },
        person: { select: { firstName: true, lastName: true } },
        supplier: { select: { name: true } },
      },
    });

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
      settings,
      schedule: { startTime: ctx.lineStart, endTime: ctx.lineEnd },
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

  async patchLine(id: string, input: any, tenantId: string) {
    const line = await this.prisma.eventStaffLine.findFirst({ where: { id, tenantId } });
    if (!line) throw new NotFoundException(`Ligne de staff ${id} introuvable`);
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

  async addLine(eventId: string, input: any, tenantId: string) {
    const ctx = await this.getEventContext(eventId, tenantId);
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
    const hr = await this.loadHrContext(tenantId, ctx.spaceId);
    const assignment = this.pickAssignment(role, 0, hr);
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

  async removeLine(id: string, tenantId: string) {
    const line = await this.prisma.eventStaffLine.findFirst({ where: { id, tenantId } });
    if (!line) throw new NotFoundException(`Ligne de staff ${id} introuvable`);
    if (line.source !== 'MANUAL') {
      throw new BadRequestException(
        'Seules les lignes ajoutées manuellement peuvent être supprimées — décochez la ligne pour l’exclure du coût.',
      );
    }
    await this.prisma.eventStaffLine.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Agrégat coûts par espace (GET /hr-settings/costs, cartes HrSettingsView) ──

  async costsBySpace(tenantId: string, spaceId?: string) {
    const lines = await this.prisma.eventStaffLine.findMany({
      where: {
        tenantId,
        enabled: true,
        ...(spaceId && { event: { spaceId } }),
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
