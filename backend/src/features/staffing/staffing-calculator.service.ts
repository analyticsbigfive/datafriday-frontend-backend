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
export const DEFAULT_OFFSET_OPEN_MINUTES = -60; // horaires suggérés : portes − 1 h
export const DEFAULT_OFFSET_CLOSE_MINUTES = 60; // portes + 1 h

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
}

export interface StaffingWarning {
  code: string;
  message: string;
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

    // 6. front food
    if (input.hasFrontFood) {
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
