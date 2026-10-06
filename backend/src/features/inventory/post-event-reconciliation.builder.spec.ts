import { buildPostEventLines, postEventKey, previousLineInfo } from './post-event-reconciliation.builder';

/** Réconciliation post-event côté serveur (lot 4b, document Bertrand 2026-10-06). */
describe('buildPostEventLines', () => {
  const base = {
    preEventUnitsByKey: new Map([[postEventKey('pdv1', 'coca'), 468]]),
    preEventElementIds: new Set(['pdv1']),
    movementUnitsByKey: new Map<string, number>(),
    soldUnitsByKey: new Map([[postEventKey('pdv1', 'coca'), 380]]),
    previousByKey: new Map(),
    unitCostByItemId: new Map([['coca', 2]]),
    unitsPerPackByItemId: new Map([['coca', 24]]),
    elementNameById: new Map([['pdv1', 'Buvette du Parvis']]),
    itemNameById: new Map([['coca', 'Coca-Cola CAN 33cl']]),
  };

  it('exemple du module 10 : restant 88, compté 85, manquant 3, 6 €', () => {
    const [line] = buildPostEventLines({ ...base, counted: [{ elementId: 'pdv1', itemId: 'coca', units: 85 }] });
    expect(line).toMatchObject({
      elementName: 'Buvette du Parvis',
      itemName: 'Coca-Cola CAN 33cl',
      soldUnits: 380,
      leftFromSales: 88,
      baselineSource: 'pre-event',
      countedUnits: 85,
      missingUnits: 3,
      missingValue: 6,
      unitsPerPack: 24,
    });
  });

  it('une ligne par article compté seulement', () => {
    const lines = buildPostEventLines({
      ...base,
      soldUnitsByKey: new Map([
        [postEventKey('pdv1', 'coca'), 380],
        [postEventKey('pdv1', 'eau'), 50],
      ]),
      counted: [{ elementId: 'pdv1', itemId: 'coca', units: 85 }],
    });
    expect(lines.map((l) => l.itemKey)).toEqual(['coca']);
  });

  it("PDV absent de l'avant-match : pas de départ à 0, restant et manquant à null", () => {
    const [line] = buildPostEventLines({ ...base, counted: [{ elementId: 'pdv2', itemId: 'coca', units: 10 }] });
    expect(line).toMatchObject({ leftFromSales: null, missingUnits: null, baselineSource: null });
  });

  it("prédit, unité et coût repris du contexte de l'écran", () => {
    const previousByKey = previousLineInfo([
      { elementId: 'pdv1', itemKey: 'biere', predictedUnits: 400, unitCost: 3, unit: 'L', packaging: 'Fût de 30 L' },
    ]);
    const [line] = buildPostEventLines({
      ...base,
      previousByKey,
      preEventUnitsByKey: new Map([[postEventKey('pdv1', 'biere'), 100]]),
      soldUnitsByKey: new Map([[postEventKey('pdv1', 'biere'), 60]]),
      counted: [{ elementId: 'pdv1', itemId: 'biere', units: 30 }],
    });
    expect(line).toMatchObject({ predictedUnits: 400, unit: 'L', packaging: 'Fût de 30 L', missingUnits: 10, missingValue: 30 });
  });
});
