import {
  StaffingCalculatorService,
  StaffingInput,
  DAILY_HOURS,
  MONTHLY_HOURS,
} from './staffing-calculator.service';

/**
 * Tests obligatoires du calculateur (spec §6, paliers validés JLH 2026-07-29).
 * Règle : n = FLOOR(CA / goalTpe) ; invariant rpdv + caissiers + runners = n (n ≥ 1).
 */
describe('StaffingCalculatorService', () => {
  const calc = new StaffingCalculatorService();

  const base = (over: Partial<StaffingInput> = {}): StaffingInput => ({
    caPredictif: 0,
    goalTpe: 1000,
    metresLineaires: null, // pas de plafond TPE par défaut
    ouvertureObligatoire: false,
    peakTxParMin: 0,
    txParSeconde: 30,
    hasResponsablePdv: false,
    hasBeverage: false,
    nbTireuses: 0,
    hasFrontFood: false,
    nbFriteuses: 0,
    nbBurgersPrevus: 0,
    nbDinettes: 0,
    nbHotdogsPrevus: 0,
    hasMixology: false,
    hasKitchenFood: false,
    ...over,
  });

  const triple = (over: Partial<StaffingInput>) => {
    const r = calc.calculate(base(over));
    return r.open ? `${r.rpdv}/${r.caissiers}/${r.runners}` : 'FERMÉ';
  };

  describe('ouverture obligatoire, sans RPDV (rpdv/caissiers/runners)', () => {
    it.each([
      [500, '0/1/0'], // n=0 → total forcé à 1
      [1500, '0/1/0'], // n=1
      [2500, '0/1/1'], // n=2
      [3500, '0/2/1'], // n=3
      [4500, '0/2/2'], // n=4
      [5500, '0/3/2'], // n=5
    ])('CA %i → %s', (ca, expected) => {
      expect(triple({ caPredictif: ca, ouvertureObligatoire: true })).toBe(expected);
    });
  });

  describe('ouverture obligatoire, avec RPDV', () => {
    it.each([
      [500, '1/0/0'], // n=0 → total forcé à 1
      [1500, '1/0/0'], // n=1
      [2500, '1/1/0'], // n=2
      [3500, '1/1/1'], // n=3
      [4500, '1/2/1'], // n=4
      [5500, '1/2/2'], // n=5
      [6500, '1/2/3'], // n=6 — littéral confirmé (caissiers plafonnés à 2)
    ])('CA %i → %s', (ca, expected) => {
      expect(
        triple({ caPredictif: ca, ouvertureObligatoire: true, hasResponsablePdv: true }),
      ).toBe(expected);
    });
  });

  describe('ouverture non obligatoire', () => {
    it('CA 900 (n=0) → FERMÉ, tout à 0', () => {
      const r = calc.calculate(base({ caPredictif: 900 }));
      expect(r.open).toBe(false);
      expect(r.rpdv + r.caissiers + r.runners + r.barman + r.chefDePartie + r.commis + r.epr).toBe(0);
    });
    it('CA 1500 (n=1) sans RPDV → 0/1/0', () => {
      expect(triple({ caPredictif: 1500 })).toBe('0/1/0');
    });
    it('CA 1500 (n=1) avec RPDV → 1/0/0', () => {
      expect(triple({ caPredictif: 1500, hasResponsablePdv: true })).toBe('1/0/0');
    });
  });

  describe('invariant rpdv + caissiers + runners = n (n = 1..10)', () => {
    it.each([false, true])('hasResponsablePdv=%s', (rp) => {
      for (let n = 1; n <= 10; n++) {
        const r = calc.calculate(base({ caPredictif: n * 1000 + 10, hasResponsablePdv: rp }));
        expect(r.rpdv + r.caissiers + r.runners).toBe(n);
      }
    });
  });

  describe('règles conservées', () => {
    it('5 m / 0,7 → maxTpe 8', () => {
      const r = calc.calculate(base({ caPredictif: 1000, metresLineaires: 5 }));
      expect(r.maxTpe).toBe(8);
    });

    it('clamp TPE : excédent de caissiers basculé en runners (invariant préservé)', () => {
      // n=9 sans RPDV → 5 caissiers / 4 runners ; maxTpe=2 → 2 caissiers / 7 runners
      const r = calc.calculate(base({ caPredictif: 9010, metresLineaires: 1.4 }));
      expect(r.maxTpe).toBe(2);
      expect(r.caissiers).toBe(2);
      expect(r.runners).toBe(7);
      expect(r.rpdv + r.caissiers + r.runners).toBe(9);
    });

    it('29 front / 15 → 2 Responsables de zone', () => {
      expect(calc.zoneManagers(29, 15)).toBe(2);
    });

    it('500 burgers → 6 commis burger', () => {
      const r = calc.calculate(
        base({ caPredictif: 2000, hasFrontFood: true, nbBurgersPrevus: 500 }),
      );
      expect(r.commis).toBe(6); // CEIL(500/200)·2
      expect(r.chefDePartie).toBe(1);
    });

    it('beverage : runners = MAX(runners, tireuses) (Q3)', () => {
      // n=2 sans RPDV → 1/1 ; 4 tireuses → runners = 4
      const r = calc.calculate(
        base({ caPredictif: 2500, hasBeverage: true, nbTireuses: 4 }),
      );
      expect(r.runners).toBe(4);
    });

    it('mixology → 1 barman, compté dans le front', () => {
      const r = calc.calculate(base({ caPredictif: 2500, hasMixology: true }));
      expect(r.barman).toBe(1);
      expect(r.front).toBe(r.rpdv + r.caissiers + r.runners + 1);
    });
  });

  // BUG-122 / CFG-1 (2026-07-30) : Kitchen Food OR-é dans la recette front-food
  // en attendant une formule dédiée (question ouverte, cf. QUESTIONS_A_BERTRAND.md).
  describe('Kitchen Food (hasKitchenFood, §CFG-1)', () => {
    it('hasKitchenFood seul (sans hasFrontFood) déclenche la même recette que front-food', () => {
      const r = calc.calculate(
        base({ caPredictif: 2000, hasFrontFood: false, hasKitchenFood: true, nbBurgersPrevus: 500 }),
      );
      expect(r.chefDePartie).toBe(1);
      expect(r.commis).toBe(6); // CEIL(500/200)·2, identique au test "500 burgers"
    });

    it('ni hasFrontFood ni hasKitchenFood → pas de chef de partie', () => {
      const r = calc.calculate(base({ caPredictif: 2000 }));
      expect(r.chefDePartie).toBe(0);
      expect(r.commis).toBe(0);
    });
  });

  // STF-2 : règles Sinking RH — quota minimal forcé par rôle, en supplément du
  // calcul par paliers ci-dessus (pure, aucun accès BD).
  describe('applySinkingRules (STF-2)', () => {
    const rule = (over: Partial<Parameters<StaffingCalculatorService['applySinkingRules']>[2][number]> = {}) => ({
      roleId: 'role-1',
      fnbCategory: 'KITCHEN_FOOD',
      conditionAttribute: null,
      conditionMinValue: null,
      mandatoryQty: 1,
      ...over,
    });

    it('aucune règle ne matche (tag absent) → []', () => {
      const out = calc.applySinkingRules(new Set(['BEVERAGE']), {}, [rule()]);
      expect(out).toEqual([]);
    });

    it('règle sans condition, tag présent → toujours appliquée', () => {
      const out = calc.applySinkingRules(new Set(['KITCHEN_FOOD']), {}, [rule({ mandatoryQty: 2 })]);
      expect(out).toEqual([{ roleId: 'role-1', qty: 2 }]);
    });

    it('règle avec condition franchie (attribut ≥ seuil) → appliquée', () => {
      const out = calc.applySinkingRules(
        new Set(['KITCHEN_FOOD']),
        { nbFriteuses: 3 },
        [rule({ conditionAttribute: 'nbFriteuses', conditionMinValue: 2 })],
      );
      expect(out).toEqual([{ roleId: 'role-1', qty: 1 }]);
    });

    it('règle avec condition non franchie (attribut < seuil) → omise', () => {
      const out = calc.applySinkingRules(
        new Set(['KITCHEN_FOOD']),
        { nbFriteuses: 1 },
        [rule({ conditionAttribute: 'nbFriteuses', conditionMinValue: 2 })],
      );
      expect(out).toEqual([]);
    });

    it('règle avec condition sur un attribut absent/non numérique → omise', () => {
      const out = calc.applySinkingRules(
        new Set(['KITCHEN_FOOD']),
        {},
        [rule({ conditionAttribute: 'nbFriteuses', conditionMinValue: 2 })],
      );
      expect(out).toEqual([]);
    });
  });

  // Auto-remplissage Staff Builder (2026-07-30, révisé suite retour utilisateur) :
  // le tag F&B seul suffit, la règle Sinking n'est qu'un raffinement optionnel.
  describe('computeStaffSuggestions (Builder Staff, tag seul suffit)', () => {
    const role = (over: Partial<Parameters<StaffingCalculatorService['computeStaffSuggestions']>[2][number]> = {}) => ({
      id: 'role-1',
      name: 'Cuisinier',
      fnbCategories: ['BEVERAGE'],
      rateType: 'HOURLY' as const,
      rate: 20,
      ...over,
    });

    it('rôle tagué, aucune règle Sinking → qty=1 par défaut (le cas rapporté)', () => {
      const out = calc.computeStaffSuggestions(new Set(['BEVERAGE']), {}, [role()], []);
      expect(out).toEqual([{ roleId: 'role-1', roleName: 'Cuisinier', qty: 1, hourlyRate: 20 }]);
    });

    it('rôle non tagué pour le tag présent → absent du résultat', () => {
      const out = calc.computeStaffSuggestions(
        new Set(['BEVERAGE']),
        {},
        [role({ fnbCategories: ['KITCHEN_FOOD'] })],
        [],
      );
      expect(out).toEqual([]);
    });

    it('règle Sinking SANS condition → override la quantité par défaut', () => {
      const out = calc.computeStaffSuggestions(
        new Set(['BEVERAGE']),
        {},
        [role()],
        [{ roleId: 'role-1', fnbCategory: 'BEVERAGE', conditionAttribute: null, conditionMinValue: null, mandatoryQty: 3 }],
      );
      expect(out).toEqual([{ roleId: 'role-1', roleName: 'Cuisinier', qty: 3, hourlyRate: 20 }]);
    });

    it('règle Sinking AVEC condition → masque le défaut « tag seul », condition non remplie → absent', () => {
      const out = calc.computeStaffSuggestions(
        new Set(['KITCHEN_FOOD']),
        {}, // pas d'attribut nbFriteuses sur l'élément
        [role({ fnbCategories: ['KITCHEN_FOOD'] })],
        [{ roleId: 'role-1', fnbCategory: 'KITCHEN_FOOD', conditionAttribute: 'nbFriteuses', conditionMinValue: 1, mandatoryQty: 1 }],
      );
      expect(out).toEqual([]); // le rôle n'apparaît PAS par défaut : il est devenu conditionnel
    });

    it('règle Sinking AVEC condition remplie → appliquée avec sa propre quantité', () => {
      const out = calc.computeStaffSuggestions(
        new Set(['KITCHEN_FOOD']),
        { nbFriteuses: 2 },
        [role({ fnbCategories: ['KITCHEN_FOOD'] })],
        [{ roleId: 'role-1', fnbCategory: 'KITCHEN_FOOD', conditionAttribute: 'nbFriteuses', conditionMinValue: 1, mandatoryQty: 5 }],
      );
      expect(out).toEqual([{ roleId: 'role-1', roleName: 'Cuisinier', qty: 5, hourlyRate: 20 }]);
    });

    it('rôle tagué sur 2 catégories présentes → une seule ligne, quantité = max (pas de doublon/somme)', () => {
      const out = calc.computeStaffSuggestions(
        new Set(['BEVERAGE', 'FRONT_FOOD']),
        {},
        [role({ fnbCategories: ['BEVERAGE', 'FRONT_FOOD'] })],
        [{ roleId: 'role-1', fnbCategory: 'FRONT_FOOD', conditionAttribute: null, conditionMinValue: null, mandatoryQty: 2 }],
      );
      expect(out).toEqual([{ roleId: 'role-1', roleName: 'Cuisinier', qty: 2, hourlyRate: 20 }]);
    });

    it('deux rôles différents tagués → deux lignes distinctes', () => {
      const out = calc.computeStaffSuggestions(
        new Set(['BEVERAGE']),
        {},
        [role(), role({ id: 'role-2', name: 'Barman', rate: 18 })],
        [],
      );
      expect(out).toEqual([
        { roleId: 'role-1', roleName: 'Cuisinier', qty: 1, hourlyRate: 20 },
        { roleId: 'role-2', roleName: 'Barman', qty: 1, hourlyRate: 18 },
      ]);
    });
  });

  describe('coûts et conversions (§5, Q6)', () => {
    it('1 caissier 25 €/h, portes 17:00–23:30, offsets −1 h/+1 h → 8,5 h → 212,50 €', () => {
      const start = new Date('2026-07-29T17:00:00Z');
      const end = new Date('2026-07-29T23:30:00Z');
      const lineStart = new Date(start.getTime() - 60 * 60_000);
      const lineEnd = new Date(end.getTime() + 60 * 60_000);
      expect(calc.round2(calc.lineCost(25, lineStart, lineEnd))).toBe(212.5);
    });

    it('conversions Daily/8 h et Monthly/151,67 h', () => {
      expect(calc.hourlyRateFrom('HOURLY', 16)).toBe(16);
      expect(calc.hourlyRateFrom('DAILY', 160)).toBeCloseTo(160 / DAILY_HOURS, 10);
      expect(calc.hourlyRateFrom('MONTHLY', 2426.72)).toBeCloseTo(2426.72 / MONTHLY_HOURS, 10);
      expect(calc.hourlyRateFrom(null, 16)).toBeNull();
    });
  });

  describe('warnings', () => {
    it('POS_SUPPLEMENTAIRE_RECOMMANDE si pic > cadence et caissiers < maxTpe (Q1/Q2)', () => {
      // n=1 → 1 caissier, cadence = 2 tx/min (30 tx/s) ; pic 6 ; maxTpe 8
      const r = calc.calculate(
        base({ caPredictif: 1500, metresLineaires: 5, peakTxParMin: 6, txParSeconde: 30 }),
      );
      expect(r.warnings.some((w) => w.code === 'POS_SUPPLEMENTAIRE_RECOMMANDE')).toBe(true);
    });

    it('SOUS_EFFECTIF si productivité > 2500 €', () => {
      // goal 3000, CA 2900 obligatoire → n=0, total forcé à 1 → productivité 2900
      const r = calc.calculate(
        base({ caPredictif: 2900, goalTpe: 3000, ouvertureObligatoire: true }),
      );
      expect(r.warnings.some((w) => w.code === 'SOUS_EFFECTIF')).toBe(true);
    });

    it('SUREFFECTIF si productivité < 1000 €', () => {
      // obligatoire, CA 450, n=0 → total 1 → productivité 450
      const r = calc.calculate(base({ caPredictif: 450, ouvertureObligatoire: true }));
      expect(r.warnings.some((w) => w.code === 'SUREFFECTIF')).toBe(true);
    });
  });
});
