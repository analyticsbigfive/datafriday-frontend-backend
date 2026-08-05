import { Injectable } from '@nestjs/common';

/**
 * Calculateur de staffing — fonctions PURES, aucun accès BD (spec §1.3).
 * Règle des paliers validée JLH 2026-07-29 :
 *
 *   n = FLOOR(caPredictif / goalTpe)   — invariant : rpdv + caissiers + runners = n (n ≥ 1)
 *
 *   0. ouvre  = ouvertureObligatoire OU n ≥ 1 (CA ≥ goal) ; sinon FERMÉ, tout = 0
 *      total  = MAX(n, 1)              — ouverture obligatoire et n ≤ 1 → total = 1
 *   3. sans RPDV : caissiers = CEIL(total/2) ; runners = FLOOR(total/2)
 *                  paliers 0/1/0 · 0/1/1 · 0/2/1 · 0/2/2 · 0/3/2 · …
 *      avec RPDV : total ≤ 1 → 1/0/0 · = 2 → 1/1/0 · = 3 → 1/1/1 · ≥ 4 → 1/2/(total−3)
 *                  paliers 1/2/1 · 1/2/2 · 1/2/3 · … (caissiers plafonnés à 2,
 *                  le RPDV tient le comptoir — littéral confirmé, cf. rapport)
 *      clamp TPE : caissiers ≤ maxTpe, excédent basculé en runners (invariant préservé)
 *   4. beverage : runners = MAX(runners, nbTireuses)               (Q3 défaut)
 *   5. barman = hasMixology ? 1 : 0
 *   6. frontFood : chefDePartie = 1 ; commis = nbFriteuses + CEIL(nbBurgers/200)·2 ;
 *      epr = nbDinettes + FLOOR(nbHotdogs/200)
 *   7. rz = CEIL(Σ staffFront zone / staffPerZoneManager)  — front = rpdv+caissiers+runners+barman
 *   8. productivité = caPredictif / (rpdv+caissiers+runners) + warnings
 */

// ── Constantes nommées (aucune valeur métier en dur ailleurs) — Q1–Q7 spec §7 ──
export const TPE_PAR_METRE = 0.7;
export const BURGERS_PER_COMMIS_BATCH = 200; // CEIL(nbBurgers/200)·2 commis
export const COMMIS_PER_BURGER_BATCH = 2;
export const HOTDOGS_PER_EPR_BATCH = 200; // FLOOR(nbHotdogs/200) EPR
export const TX_RATE_BASIS = 'PEAK' as const; // Q1 : cadence appliquée au pic
export const EXTRA_POS_MODE = 'WARNING' as const; // Q2 : POS supplémentaire = warning, pas de caissier auto
export const BEVERAGE_RUNNER_MODE = 'MAX' as const; // Q3 : runners = MAX(runners, tireuses)
export const DINETTE_CASHIER_INCLUDED = true; // Q4 : caissier de dinette couvert par le calcul caissiers
// Q5 : commis inter-stands mutualisés — NON TRAITÉ (TODO visible, cf. rapport final)
export const DAILY_HOURS = 8; // Q6 : conversion Daily → horaire
export const MONTHLY_HOURS = 151.67; // Q6 : conversion Monthly → horaire
export const PRODUCTIVITY_UNDERSTAFF_THRESHOLD = 2500; // > 2500 €/pers → SOUS_EFFECTIF
export const PRODUCTIVITY_OVERSTAFF_THRESHOLD = 1000; // < 1000 €/pers → SUREFFECTIF
export const DEFAULT_TX_PAR_SECONDE = 30; // capacité type : 30 | 60
export const DEFAULT_OFFSET_OPEN_MINUTES = -120; // horaires suggérés : ouverture des portes − 2 h
export const DEFAULT_OFFSET_CLOSE_MINUTES = 120; // heure de fin + 2 h

export const ALGO_KEYS = [
  'RESPONSABLE_ZONE',
  'RESPONSABLE_PDV',
  'CAISSIER',
  'RUNNER',
  'BARMAN',
  'CHEF_DE_PARTIE',
  'COMMIS',
  'EPR',
] as const;
export type AlgoKey = (typeof ALGO_KEYS)[number];

export interface StaffingInput {
  caPredictif: number;
  goalTpe: number;
  /** null = mètres linéaires inconnus → pas de plafond TPE (pas de valeur inventée). */
  metresLineaires: number | null;
  ouvertureObligatoire: boolean;
  peakTxParMin: number;
  txParSeconde: number; // 30 | 60
  hasResponsablePdv: boolean;
  hasBeverage: boolean;
  nbTireuses: number;
  hasFrontFood: boolean;
  nbFriteuses: number;
  nbBurgersPrevus: number;
  nbDinettes: number;
  nbHotdogsPrevus: number;
  hasMixology: boolean;
  /** Kitchen Food (CFG-1) — même recette front-food (chefDePartie/commis/epr) tant
   *  qu'aucune formule dédiée n'a été tranchée par le métier (question ouverte,
   *  cf. QUESTIONS_A_BERTRAND.md). */
  hasKitchenFood: boolean;
}

export interface StaffingWarning {
  code: string;
  message: string;
}

/** Règle « Sinking RH » (STF-2) — miroir pur du modèle Prisma HrSinkingRule. */
export interface SinkingRuleInput {
  roleId: string;
  fnbCategory: string;
  conditionAttribute: string | null;
  conditionMinValue: number | null;
  mandatoryQty: number;
}

export interface SinkingRuleOutcome {
  roleId: string;
  qty: number;
}

/**
 * Association Rôle ↔ Menu Item(s) — miroir pur du modèle Prisma HrRoleMenuItemRatio.
 * `targetMenuItemIds` est déjà résolu par l'appelant (allMenuItems expansé en amont) — cette
 * fonction reste pure, sans accès DB. Voir 11_RH_STAFFING.md §11.16.
 */
export interface MenuItemRatioInput {
  roleId: string;
  ratioBasis: 'REVENUE' | 'QUANTITY';
  ratioValue: number;
  unitQty: number;
  targetMenuItemIds: string[];
}

/** Valeur "vendu/prévu" pour un Menu Item donné — miroir pur d'ElementMenuItemSalesInput. */
export interface MenuItemSalesValue {
  menuItemId: string;
  quantity: number;
  revenueHt: number;
}

/** Miroir pur du HrRole (uniquement les champs nécessaires au calcul). */
export interface RoleTagInput {
  id: string;
  name: string;
  fnbCategories: string[];
  rateType: string | null;
  rate: number | null;
}

export interface StaffSuggestion {
  roleId: string;
  roleName: string;
  qty: number;
  hourlyRate: number;
}

export interface StaffingResult {
  open: boolean;
  n: number;
  total: number;
  maxTpe: number | null;
  rpdv: number;
  caissiers: number;
  runners: number;
  barman: number;
  chefDePartie: number;
  commis: number;
  epr: number;
  /** Base du calcul RZ : rpdv + caissiers + runners + barman. */
  front: number;
  productivite: number | null;
  warnings: StaffingWarning[];
}

@Injectable()
export class StaffingCalculatorService {
  calculate(input: StaffingInput): StaffingResult {
    const r: StaffingResult = {
      open: false,
      n: 0,
      total: 0,
      maxTpe: null,
      rpdv: 0,
      caissiers: 0,
      runners: 0,
      barman: 0,
      chefDePartie: 0,
      commis: 0,
      epr: 0,
      front: 0,
      productivite: null,
      warnings: [],
    };

    const goal = input.goalTpe;
    const n = goal > 0 ? Math.floor(input.caPredictif / goal) : 0;
    r.n = n;

    // 0. ouverture : fermé si non obligatoire et n = 0 (CA < goal)
    r.open = !!input.ouvertureObligatoire || n >= 1;
    if (!r.open) return r;

    // 1. maxTpe (null si mètres linéaires inconnus)
    r.maxTpe =
      input.metresLineaires !== null && input.metresLineaires >= 0
        ? Math.ceil(input.metresLineaires / TPE_PAR_METRE)
        : null;

    // 2. rpdv
    r.rpdv = input.hasResponsablePdv ? 1 : 0;

    // 3. répartition caissiers / runners — total = n, forcé à 1 si obligatoire et n ≤ 1
    const total = Math.max(n, 1);
    r.total = total;
    if (r.rpdv === 0) {
      r.caissiers = Math.ceil(total / 2);
      r.runners = Math.floor(total / 2);
    } else if (total <= 1) {
      r.caissiers = 0;
      r.runners = 0;
    } else if (total === 2) {
      r.caissiers = 1;
      r.runners = 0;
    } else if (total === 3) {
      r.caissiers = 1;
      r.runners = 1;
    } else {
      // avec RPDV : caissiers plafonnés à 2, l'excédent part en runners
      r.caissiers = 2;
      r.runners = total - 3;
    }

    // clamp TPE : l'excédent de caissiers bascule en runners (invariant préservé)
    if (r.maxTpe !== null && r.caissiers > r.maxTpe) {
      r.runners += r.caissiers - r.maxTpe;
      r.caissiers = r.maxTpe;
    }

    // Q2 : warning POS supplémentaire (jamais de caissier auto)
    const cadence = r.caissiers * (60 / (input.txParSeconde || DEFAULT_TX_PAR_SECONDE));
    if (
      EXTRA_POS_MODE === 'WARNING' &&
      input.peakTxParMin > cadence &&
      (r.maxTpe === null || r.caissiers < r.maxTpe)
    ) {
      r.warnings.push({
        code: 'POS_SUPPLEMENTAIRE_RECOMMANDE',
        message: `Pic ${input.peakTxParMin} tx/min > capacité ${cadence.toFixed(0)} tx/min — TPE supplémentaire recommandé`,
      });
    }

    // 4. beverage (Q3 : MAX, pas addition)
    if (input.hasBeverage && BEVERAGE_RUNNER_MODE === 'MAX') {
      r.runners = Math.max(r.runners, input.nbTireuses || 0);
    }

    // 5. barman
    r.barman = input.hasMixology ? 1 : 0;

    // 6. front food (Kitchen Food OR-é en attendant une formule dédiée, cf. hasKitchenFood)
    if (input.hasFrontFood || input.hasKitchenFood) {
      r.chefDePartie = 1;
      r.commis =
        (input.nbFriteuses || 0) +
        Math.ceil((input.nbBurgersPrevus || 0) / BURGERS_PER_COMMIS_BATCH) * COMMIS_PER_BURGER_BATCH;
      r.epr = (input.nbDinettes || 0) + Math.floor((input.nbHotdogsPrevus || 0) / HOTDOGS_PER_EPR_BATCH);
    }

    // 7. base RZ
    r.front = r.rpdv + r.caissiers + r.runners + r.barman;

    // 8. productivité + warnings
    const prodBase = r.rpdv + r.caissiers + r.runners;
    if (prodBase > 0) {
      r.productivite = input.caPredictif / prodBase;
      if (r.productivite < goal) {
        r.warnings.push({
          code: 'OBJECTIF_TPE_NON_ATTEINT',
          message: `Productivité ${Math.round(r.productivite)} € < goal ${goal} €`,
        });
      }
      if (r.productivite > PRODUCTIVITY_UNDERSTAFF_THRESHOLD) {
        r.warnings.push({
          code: 'SOUS_EFFECTIF',
          message: `Productivité ${Math.round(r.productivite)} € > ${PRODUCTIVITY_UNDERSTAFF_THRESHOLD} €`,
        });
      }
      if (r.productivite < PRODUCTIVITY_OVERSTAFF_THRESHOLD) {
        r.warnings.push({
          code: 'SUREFFECTIF',
          message: `Productivité ${Math.round(r.productivite)} € < ${PRODUCTIVITY_OVERSTAFF_THRESHOLD} €`,
        });
      }
    }

    return r;
  }

  /**
   * Règles « Sinking RH » (STF-2) : quota minimal forcé d'un rôle si son tag FNB
   * est détecté sur le PDV et que sa condition d'équipement (optionnelle) est
   * remplie. Appliqué en SUPPLÉMENT du calcul par paliers, jamais à sa place —
   * ne modifie pas `StaffingResult`, retourne les rôles/quantités à ajouter.
   */
  applySinkingRules(
    fnbTags: Set<string>,
    attrs: Record<string, any>,
    rules: SinkingRuleInput[],
  ): SinkingRuleOutcome[] {
    const out: SinkingRuleOutcome[] = [];
    for (const rule of rules) {
      if (!fnbTags.has(rule.fnbCategory)) continue;
      if (rule.conditionAttribute) {
        const v = Number(attrs[rule.conditionAttribute]);
        if (!Number.isFinite(v) || v < (rule.conditionMinValue ?? 0)) continue;
      }
      out.push({ roleId: rule.roleId, qty: rule.mandatoryQty });
    }
    return out;
  }

  /**
   * Association Rôle ↔ Menu Item(s) (11_RH_STAFFING.md §11.16) : dimensionne un rôle selon le
   * volume de vente (CA ou Quantités) d'un ou plusieurs Menu Items sur l'élément courant —
   * qty = floor(valeur courante / ratioValue) * unitQty. Contrairement à `applySinkingRules` (qui
   * prend le max entre plusieurs règles pour un même rôle), les résultats sont ICI SOMMÉS par
   * rôle : chaque ratio est un driver de charge additif ("+2 pour les burgers" ET "+3 pour les
   * frites" doivent s'ajouter, pas se plafonner l'un l'autre). Pure, sans accès DB —
   * `targetMenuItemIds` doit déjà avoir résolu `allMenuItems` côté appelant.
   */
  applyMenuItemRatios(
    ratios: MenuItemRatioInput[],
    sales: MenuItemSalesValue[],
  ): SinkingRuleOutcome[] {
    const salesByItem = new Map(sales.map((s) => [s.menuItemId, s]));
    const byRoleQty = new Map<string, number>();
    for (const ratio of ratios) {
      let sum = 0;
      for (const menuItemId of ratio.targetMenuItemIds) {
        const s = salesByItem.get(menuItemId);
        if (!s) continue;
        sum += ratio.ratioBasis === 'REVENUE' ? s.revenueHt : s.quantity;
      }
      const qty = Math.floor(sum / ratio.ratioValue) * ratio.unitQty;
      if (qty > 0) {
        byRoleQty.set(ratio.roleId, (byRoleQty.get(ratio.roleId) ?? 0) + qty);
      }
    }
    return [...byRoleQty.entries()].map(([roleId, qty]) => ({ roleId, qty }));
  }

  /**
   * Auto-remplissage du Staff dans le 3D Builder (2026-07-30, retour utilisateur) :
   * un rôle dont le tag F&B (fnbCategories) matche un sous-type présent sur le PDV
   * suffit à le rendre obligatoire (quantité 1 par défaut) — PAS besoin de créer une
   * règle Sinking en plus. Une règle Sinking SANS condition ne fait qu'ajuster la
   * quantité par défaut. Une règle Sinking AVEC condition (équipement) rend le rôle
   * conditionnel POUR CETTE CATÉGORIE : il disparaît du défaut « tag seul » et
   * n'apparaît que si la condition est remplie (ex. EPR uniquement si bain-marie).
   * Résolution par (rôle × catégorie présente) ; si un rôle matche plusieurs
   * catégories à la fois, on retient le maximum plutôt que d'additionner (un seul
   * poste, pas un doublon parce que deux tags se recoupent).
   */
  computeStaffSuggestions(
    fnbTags: Set<string>,
    attrs: Record<string, any>,
    roles: RoleTagInput[],
    rules: SinkingRuleInput[],
  ): StaffSuggestion[] {
    const rulesByRole = new Map<string, SinkingRuleInput[]>();
    for (const rule of rules) {
      if (!fnbTags.has(rule.fnbCategory)) continue;
      const list = rulesByRole.get(rule.roleId) ?? [];
      list.push(rule);
      rulesByRole.set(rule.roleId, list);
    }

    const byRoleQty = new Map<string, number>();
    for (const role of roles) {
      const matchedCategories = role.fnbCategories.filter((c) => fnbTags.has(c));
      if (matchedCategories.length === 0) continue;
      const roleRules = rulesByRole.get(role.id) ?? [];
      let qty = 0;
      for (const category of matchedCategories) {
        const rulesForCategory = roleRules.filter((r) => r.fnbCategory === category);
        const conditioned = rulesForCategory.filter((r) => r.conditionAttribute);
        if (conditioned.length > 0) {
          for (const rule of conditioned) {
            const v = Number(attrs[rule.conditionAttribute!]);
            if (Number.isFinite(v) && v >= (rule.conditionMinValue ?? 0)) {
              qty = Math.max(qty, rule.mandatoryQty);
            }
          }
        } else {
          const unconditioned = rulesForCategory[0];
          qty = Math.max(qty, unconditioned ? unconditioned.mandatoryQty : 1);
        }
      }
      if (qty > 0) byRoleQty.set(role.id, qty);
    }

    const roleById = new Map(roles.map((r) => [r.id, r]));
    return [...byRoleQty.entries()].map(([roleId, qty]) => {
      const role = roleById.get(roleId)!;
      return {
        roleId,
        roleName: role.name,
        qty,
        hourlyRate: this.hourlyRateFrom(role.rateType, role.rate) ?? 0,
      };
    });
  }

  /** rz par zone = CEIL(Σ staffFront / staffPerZoneManager). Effectifs entiers, toujours. */
  zoneManagers(frontTotal: number, staffPerZoneManager: number): number {
    if (frontTotal <= 0 || staffPerZoneManager <= 0) return 0;
    return Math.ceil(frontTotal / staffPerZoneManager);
  }

  /** Conversion d'un taux (HOURLY/DAILY/MONTHLY) en taux horaire HT (Q6). */
  hourlyRateFrom(rateType: string | null, rate: number | null): number | null {
    if (rate === null || rate === undefined) return null;
    switch (rateType) {
      case 'HOURLY':
        return rate;
      case 'DAILY':
        return rate / DAILY_HOURS;
      case 'MONTHLY':
        return rate / MONTHLY_HOURS;
      default:
        return null;
    }
  }

  /** Coût d'une ligne = taux × durée en heures décimales. Arrondi en SORTIE uniquement (§5). */
  lineCost(hourlyRate: number, startTime: Date, endTime: Date): number {
    const hours = (endTime.getTime() - startTime.getTime()) / 3_600_000;
    return hourlyRate * Math.max(hours, 0);
  }

  /** Arrondi 2 décimales — à appliquer en sortie d'API uniquement (§5). */
  round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
