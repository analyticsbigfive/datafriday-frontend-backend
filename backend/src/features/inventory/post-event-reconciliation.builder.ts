/**
 * Lignes de la réconciliation post-event calculées CÔTÉ SERVEUR (document Bertrand
 * « Pre et Post event Inventory cycle », 2026-10-06, lot 4b ; choix Ulrich du même jour :
 * une ligne par article MARQUÉ COMPTÉ, même règle que la Logistique).
 *
 * Même formule et même forme de ligne que l'écran (frontend
 * `utils/postEventReconciliation.js::buildPostEventReconciliationLines`) :
 *   restant = avant-match − vendu + mouvements ; manquant = restant − compté.
 * Différences assumées :
 *   - pas de ligne pour un article jamais compté (l'écran en faisait une avec un compté
 *     à 0, donc un faux manquant) ;
 *   - le vendu d'un PDV s'arrête à son dernier « Marquer compté » (D19), calculé par
 *     l'appelant ;
 *   - pas de repli « stock Logistique » comme point de départ : la Logistique est
 *     recalée depuis le comptage post-event pendant le match (D1), elle ne dit plus le
 *     stock de départ ;
 *   - prédit, unité et conditionnement repris du dernier brouillon de l'écran (seul à
 *     savoir éclater menus et scénario Event Predict au grain inventaire).
 *
 * Pur : aucun accès base. Les index sont keyés `elementId|itemId`.
 */

export interface PostEventCountedLine {
  elementId: string;
  itemId: string;
  units: number;
}

export interface PreviousLineInfo {
  predictedUnits?: number | null;
  unitCost?: number | null;
  unit?: string | null;
  unitsPerPack?: number | null;
  packaging?: string | null;
}

export interface BuildPostEventLinesInput {
  counted: PostEventCountedLine[];
  /** null : aucun comptage d'avant-match pour ce match (restant / manquant à null). */
  preEventUnitsByKey: Map<string, number> | null;
  /** PDV réellement comptés avant le match : un PDV absent n'a pas un départ de 0. */
  preEventElementIds: Set<string> | null;
  /** null : mouvements non pris en compte (avant-match de repli, autre match). */
  movementUnitsByKey: Map<string, number> | null;
  soldUnitsByKey: Map<string, number>;
  previousByKey: Map<string, PreviousLineInfo>;
  unitCostByItemId: Map<string, number>;
  unitsPerPackByItemId: Map<string, number | null>;
  elementNameById: Map<string, string>;
  itemNameById: Map<string, string>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const postEventKey = (elementId: string, itemId: string) => `${elementId}|${itemId}`;

export function buildPostEventLines(input: BuildPostEventLinesInput) {
  const lines = input.counted.map(({ elementId, itemId, units }) => {
    const key = postEventKey(elementId, itemId);
    const previous = input.previousByKey.get(key) ?? null;
    const soldUnits = round2(input.soldUnitsByKey.get(key) ?? 0);
    const countedUnits = round2(units);
    const movementUnits = input.movementUnitsByKey ? round2(input.movementUnitsByKey.get(key) ?? 0) : null;

    let leftFromSales: number | null = null;
    let baselineSource: 'pre-event' | null = null;
    const preCovers =
      input.preEventUnitsByKey != null && (!input.preEventElementIds || input.preEventElementIds.has(elementId));
    if (preCovers) {
      leftFromSales = round2((input.preEventUnitsByKey!.get(key) ?? 0) - soldUnits + (movementUnits ?? 0));
      baselineSource = 'pre-event';
    }

    let missingUnits: number | null = null;
    let missingValue: number | null = null;
    const cost = input.unitCostByItemId.get(itemId) ?? previous?.unitCost ?? null;
    const unitCost = cost != null && Number.isFinite(cost) ? cost : null;
    if (leftFromSales != null) {
      missingUnits = round2(leftFromSales - countedUnits);
      if (unitCost != null) missingValue = round2(missingUnits * unitCost);
    }

    return {
      elementId,
      elementName: input.elementNameById.get(elementId) ?? '',
      itemKey: itemId,
      itemName: input.itemNameById.get(itemId) ?? '',
      soldUnits,
      predictedUnits: previous?.predictedUnits ?? null,
      movementUnits,
      leftFromSales,
      baselineSource,
      countedUnits,
      missingUnits,
      missingValue,
      unitCost,
      unit: previous?.unit ?? null,
      unitsPerPack: previous?.unitsPerPack ?? input.unitsPerPackByItemId.get(itemId) ?? null,
      packaging: previous?.packaging ?? null,
    };
  });
  lines.sort(
    (a, b) =>
      a.elementName.localeCompare(b.elementName) ||
      a.itemName.localeCompare(b.itemName) ||
      a.itemKey.localeCompare(b.itemKey),
  );
  return lines;
}

/** Informations reprises du dernier brouillon (lignes d'un document post-event). */
export function previousLineInfo(lines: unknown): Map<string, PreviousLineInfo> {
  const out = new Map<string, PreviousLineInfo>();
  if (!Array.isArray(lines)) return out;
  const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  for (const l of lines as Array<Record<string, unknown>>) {
    if (typeof l?.elementId !== 'string' || typeof l?.itemKey !== 'string') continue;
    out.set(postEventKey(l.elementId, l.itemKey), {
      predictedUnits: num(l.predictedUnits),
      unitCost: num(l.unitCost),
      unit: typeof l.unit === 'string' ? l.unit : null,
      unitsPerPack: num(l.unitsPerPack),
      packaging: typeof l.packaging === 'string' ? l.packaging : null,
    });
  }
  return out;
}
