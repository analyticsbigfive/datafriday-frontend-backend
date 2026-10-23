import { CostTrackingAggregate, RecipeLineKind, SeriesPoint, SnapshotPoint, SnapshotWithRecipe } from './cost-tracking.types';

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Prix TTC ramené hors taxe ; null si le prix ou le taux est inconnu. */
export function priceHt(price: number | null, vatRate: number | null): number | null {
  if (price == null || vatRate == null) return null;
  return round2(price / (1 + vatRate / 100));
}

/**
 * Série en escalier d'UN article. `snapshots` : tous les snapshots utiles de l'article, triés par
 * date croissante, dont éventuellement le dernier antérieur à `from` (valeur déjà en vigueur).
 * Ce snapshot de report est ramené à `from` (`carried: true`). Seuls les changements de coût par
 * pièce ou de prix produisent un point : une version qui ne change que la recette est ignorée.
 */
export function buildArticlePoints(snapshots: SnapshotPoint[], from: Date, defaultVatRate: number | null = null): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const snap of snapshots) {
    const carried = snap.effectiveFrom.getTime() < from.getTime();
    const prev = points[points.length - 1];
    const cost = round4(snap.costPerPiece);
    const vat = snap.vatRate ?? defaultVatRate;
    if (prev && prev.costPerPiece === cost && prev.price === snap.basePrice) continue;
    // Deux snapshots antérieurs à `from` : le dernier remplace le précédent (même instant `from`).
    if (carried && prev?.carried) points.pop();
    points.push({
      at: (carried ? from : snap.effectiveFrom).toISOString(),
      costPerPiece: cost,
      price: snap.basePrice,
      priceHt: priceHt(snap.basePrice, vat),
      articleCount: 1,
      carried,
      snapshotId: snap.id,
      reason: snap.reason,
      totalCost: snap.totalCost,
      numberOfPieces: snap.numberOfPieces,
    });
  }
  return points;
}

/**
 * Série d'un Type ou d'une Catégorie : à chaque instant de changement d'un membre, moyenne
 * simple (ou somme si `aggregate` vaut 'sum') du coût par pièce et du prix des membres qui ont déjà une valeur. Un membre sans
 * snapshot à cet instant n'entre pas dans la moyenne, ni un membre dont le dernier point est `inactive`.
 */
export function averageStaircase(members: SeriesPoint[][], aggregate: CostTrackingAggregate = 'avg'): SeriesPoint[] {
  const lists = members.filter((m) => m.length > 0);
  if (!lists.length) return [];
  const instants = [...new Set(lists.flatMap((m) => m.map((p) => p.at)))].sort();
  const out: SeriesPoint[] = [];
  for (const at of instants) {
    let costSum = 0;
    let priceSum = 0;
    let priceCount = 0;
    let htSum = 0;
    let htCount = 0;
    let count = 0;
    let carried = true;
    let leftCount = 0;
    for (const list of lists) {
      const current = lastAtOrBefore(list, at);
      if (!current) continue;
      if (current.inactive) {
        leftCount += 1;
        continue;
      }
      count += 1;
      costSum += current.costPerPiece;
      if (current.price != null) {
        priceSum += current.price;
        priceCount += 1;
      }
      if (current.priceHt != null) {
        htSum += current.priceHt;
        htCount += 1;
      }
      if (!current.carried || current.at !== at) carried = false;
    }
    // Tous les membres sont sortis (part fournisseur tombée à 0) : la courbe retombe à 0.
    if (!count && !leftCount) continue;
    const divisor = aggregate === 'sum' ? 1 : null;
    const point: SeriesPoint = {
      at,
      costPerPiece: count ? round4(costSum / (divisor ?? count)) : 0,
      price: priceCount ? round2(priceSum / (divisor ?? priceCount)) : null,
      priceHt: htCount ? round2(htSum / (divisor ?? htCount)) : null,
      articleCount: count,
      carried,
    };
    const prev = out[out.length - 1];
    if (prev && prev.costPerPiece === point.costPerPiece && prev.price === point.price && prev.priceHt === point.priceHt && prev.articleCount === point.articleCount) continue;
    out.push(point);
  }
  return out;
}

/** Dernier point dont l'instant est inférieur ou égal à `at` (liste triée par instant). */
function lastAtOrBefore(list: SeriesPoint[], at: string): SeriesPoint | null {
  let found: SeriesPoint | null = null;
  for (const p of list) {
    if (p.at <= at) found = p;
    else break;
  }
  return found;
}

export interface IngredientSeries {
  refId: string;
  kind: RecipeLineKind;
  name: string;
  points: SeriesPoint[];
}

/**
 * Séries en escalier des lignes de recette d'UN article (mode ingrédient). Le coût d'une ligne
 * est sa quantité x son coût unitaire figés, ramené à la pièce (divisé par le nombre de pièces
 * de la version). Une ligne retirée de la recette retombe à 0 ; avant sa première apparition
 * elle n'a pas de point. Un changement de recette sans effet sur la ligne ne crée pas de point.
 */
export function buildIngredientSeries(snapshots: SnapshotWithRecipe[], from: Date): IngredientSeries[] {
  const perLine = new Map<string, { kind: RecipeLineKind; name: string; snaps: SnapshotPoint[] }>();
  for (const snap of snapshots) {
    const pieces = Math.max(snap.numberOfPieces || 1, 1);
    const present = new Map<string, number>();
    for (const line of snap.recipe) {
      const cost = (line.quantity || 0) * (line.unitCost ?? 0);
      present.set(line.refId, (present.get(line.refId) ?? 0) + cost);
      const entry = perLine.get(line.refId) ?? { kind: line.kind, name: line.name ?? '', snaps: [] };
      if (line.name) entry.name = line.name;
      perLine.set(line.refId, entry);
    }
    for (const [refId, entry] of perLine) {
      const lineCost = present.get(refId);
      // Ligne apparue plus tôt puis retirée : 0. Ligne jamais vue avant cette version : rien à poser.
      if (lineCost === undefined && !entry.snaps.length) continue;
      entry.snaps.push({ ...snap, costPerPiece: round4((lineCost ?? 0) / pieces), basePrice: null });
    }
  }
  return [...perLine.entries()]
    .map(([refId, e]) => ({ refId, kind: e.kind, name: e.name, points: buildArticlePoints(e.snaps, from) }))
    .filter((s) => s.points.length > 0);
}
