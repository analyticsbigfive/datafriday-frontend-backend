import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { StaffingCalculatorService, StaffingWarning, AlgoKey, DEFAULT_TX_PAR_SECONDE } from '../staffing-calculator.service';
import { detectFnbTags } from '../fnb-tags.util';
import { StaffingContextService } from './staffing-context.service';
import { StaffingService } from '../staffing.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Orchestration du staffing par événement (spec §1.3) :
 * charge event + PDV (SpaceElement de la config) + CA prédictif par PDV
 * (BUG-391-02 : en priorité le CA affiché à l'écran Event Predict, envoyé dans le corps
 * du POST generate ; sinon EventPredictVersion.predictedRecords de la version par défaut, agrégé par
 * shopId — #43/11_RH_STAFFING.md §11.15 option b ; repli sur
 * ElementPerformance.revenue si aucune version par défaut n'existe) + tx/min
 * (ElementPerformance) + settings RH résolus (HrGoal/HrStaffRatio) + rôles RH →
 * appelle le calculateur pur → upsert des EventStaffLine source='ALGO'.
 * Une ligne MANUAL ou userModified n'est JAMAIS écrasée par une régénération
 * (elle compte dans le quota de son rôle).
 * Le coût PRÉDIT (figé) est stocké dans ElementPerformance.staffCost ; le coût
 * AJUSTÉ se recalcule depuis les lignes enabled (§5).
 */

/** Types d'éléments considérés comme PDV pour le staffing (hypothèse, cf. rapport). */
const STAFFING_ELEMENT_TYPES = ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack'];

const ALGO_COUNT_FIELDS: Array<{ key: AlgoKey; field: string }> = [
  { key: 'RESPONSABLE_PDV', field: 'rpdv' },
  { key: 'CAISSIER', field: 'caissiers' },
  { key: 'RUNNER', field: 'runners' },
  { key: 'BARMAN', field: 'barman' },
  { key: 'CHEF_DE_PARTIE', field: 'chefDePartie' },
  { key: 'COMMIS', field: 'commis' },
  { key: 'EPR', field: 'epr' },
];

/**
 * Génération du staffing d'un événement à partir du CA prévu et des règles RH.
 */
@Injectable()
export class StaffingGenerationService {
  constructor(
    private prisma: PrismaService,
    private calculator: StaffingCalculatorService,
    private readonly staffingContextService: StaffingContextService,
    private readonly staffingService: StaffingService,
  ) {}

  // ── Génération (POST /events/:eventId/staffing/generate) ──────────────────

  async generate(
    eventId: string,
    tenantId: string,
    user?: SpaceScopedUser,
    predictedRevenueOverride?: Record<string, unknown> | null,
  ) {
    const ctx = await this.staffingContextService.getEventContext(eventId, tenantId, user);
    const settings = await this.staffingContextService.resolveSettings(ctx.spaceId, tenantId);
    if (settings.goalTpe === null) {
      throw new BadRequestException('Aucun goal TPE configuré (Settings RH) pour cet espace.');
    }
    if (settings.staffPerZoneManager === null) {
      throw new BadRequestException(
        'Aucun ratio staff par Responsable de zone configuré (Settings RH) pour cet espace.',
      );
    }
    const hr = await this.staffingContextService.loadHrContext(tenantId, ctx.spaceId);
    // Source du CA prédictif (BUG-391-02) : corps de la requête (CA affiché à l'écran) >
    // version par défaut > ElementPerformance.revenue (repli par élément dans la boucle).
    // Les clés hors configuration ne sont jamais lues : la boucle parcourt les éléments de la config.
    const override = this.staffingContextService.sanitizeRevenueOverride(predictedRevenueOverride);
    const predictedRevenueByElement =
      override.size > 0 ? override : await this.staffingContextService.resolvePredictedRevenueByElement(eventId, tenantId);

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
    // CA prédit maximum vu sur un PDV : distingue « aucun CA » de « CA sous l'objectif TPE ».
    let maxCaPredictif = 0;

    for (const el of elements) {
      const perf = el.performances[0];
      const caPredictif = predictedRevenueByElement.get(el.id) ?? perf?.revenue ?? 0;
      if (Number.isFinite(caPredictif) && caPredictif > maxCaPredictif) maxCaPredictif = caPredictif;
      const attrs = ((el as any).attributes ?? {}) as Record<string, any>;
      // BUG-122 : sous-types Builder v2 en minuscules (beverages, front_food…) — voir
      // fnb-tags.util.ts. CFG-2 Étape 4.5 : ce sont désormais aussi les valeurs stockées dans
      // HrRole.fnbCategories/HrSinkingRule.fnbCategory (Subtype.code, plus d'UPPERCASE_SNAKE).
      const fnbTags = detectFnbTags((el as any).subtypes);
      const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);

      const result = this.calculator.calculate({
        caPredictif,
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
          const assignment = this.staffingContextService.pickAssignment(role, i, hr, ctx.spaceId);
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
          const assignment = this.staffingContextService.pickAssignment(role, i, hr, ctx.spaceId);
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
          const assignment = this.staffingContextService.pickAssignment(role, i, hr, ctx.spaceId);
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

      // eslint-disable-next-line no-await-in-loop -- transaction courte par élément (pooler)
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
      if (maxCaPredictif > 0 && maxCaPredictif < settings.goalTpe) {
        // BUG-391-02 : du CA existe, mais aucun PDV n'atteint le palier n = floor(CA / goalTpe) ≥ 1.
        globalWarnings.push({
          code: 'CA_SOUS_OBJECTIF_TPE',
          message:
            `Aucun PDV n'atteint l'objectif de ${this.staffingContextService.formatEuros(settings.goalTpe)} € par TPE ` +
            `(CA prédit max : ${this.staffingContextService.formatEuros(maxCaPredictif)} €).`,
        });
      } else {
        globalWarnings.push({
          code: 'AUCUNE_LIGNE_GENEREE',
          message:
            "La génération n'a produit aucune ligne : les effectifs calculés sont tous à 0 " +
            '(CA prédictif / pic de transactions absents pour les PDV de cette configuration).',
        });
      }
    }

    return this.staffingService.getStaffing(eventId, tenantId, globalWarnings, user);
  }
}
