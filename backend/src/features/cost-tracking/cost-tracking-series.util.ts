import { SeriesPoint, SnapshotPoint } from './cost-tracking.types';

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Série en escalier d'UN article. `snapshots` : tous les snapshots utiles de l'article, triés par
 * date croissante, dont éventuellement le dernier antérieur à `from` (valeur déjà en vigueur).
 * Ce snapshot de report est ramené à `from` (`carried: true`). Seuls les changements de coût par
 * pièce ou de prix produisent un point : une version qui ne change que la recette est ignorée.
 */
export function buildArticlePoints(snapshots: SnapshotPoint[], from: Date): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const snap of snapshots) {
    const carried = snap.effectiveFrom.getTime() < from.getTime();
    const prev = points[points.length - 1];
    const cost = round4(snap.costPerPiece);
    if (prev && prev.costPerPiece === cost && prev.price === snap.basePrice) continue;
    // Deux snapshots antérieurs à `from` : le dernier remplace le précédent (même instant `from`).
    if (carried && prev?.carried) points.pop();
    points.push({
      at: (carried ? from : snap.effectiveFrom).toISOString(),
      costPerPiece: cost,
      price: snap.basePrice,
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
 * simple du coût par pièce (et du prix) des membres qui ont déjà une valeur. Un membre sans
 * snapshot à cet instant n'entre pas dans la moyenne.
 */
export function averageStaircase(members: SeriesPoint[][]): SeriesPoint[] {
  const lists = members.filter((m) => m.length > 0);
  if (!lists.length) return [];
  const instants = [...new Set(lists.flatMap((m) => m.map((p) => p.at)))].sort();
  const out: SeriesPoint[] = [];
  for (const at of instants) {
    let costSum = 0;
    let priceSum = 0;
    let priceCount = 0;
    let count = 0;
    let carried = true;
    for (const list of lists) {
      const current = lastAtOrBefore(list, at);
      if (!current) continue;
      count += 1;
      costSum += current.costPerPiece;
      if (current.price != null) {
        priceSum += current.price;
        priceCount += 1;
      }
      if (!current.carried || current.at !== at) carried = false;
    }
    if (!count) continue;
    const point: SeriesPoint = {
      at,
      costPerPiece: round4(costSum / count),
      price: priceCount ? round2(priceSum / priceCount) : null,
      articleCount: count,
      carried,
    };
    const prev = out[out.length - 1];
    if (prev && prev.costPerPiece === point.costPerPiece && prev.price === point.price && prev.articleCount === point.articleCount) continue;
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
