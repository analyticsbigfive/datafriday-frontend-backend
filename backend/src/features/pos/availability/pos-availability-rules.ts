import type { PosAvailability } from '../pos.contracts';

/**
 * Règles pures de disponibilité de la caisse (lot L5). Aucune valeur métier figée dans le
 * service : le seuil « stock bas » se règle par la variable d'environnement
 * POS_LOW_STOCK_UNITS (défaut ci-dessous) ou par l'option `lowThreshold` de l'appelant, et la
 * fonction `resolveLowThreshold` est le point unique à brancher plus tard sur un réglage par
 * évènement ou par article (colonne à ajouter à PosEventSetting, hors périmètre du lot).
 */

/** Seuil par défaut : « stock bas » quand il reste 5 unités vendables ou moins. */
export const POS_DEFAULT_LOW_STOCK_UNITS = 5;

/** Marge de tolérance sur les flottants (0,1 + 0,2) avant l'arrondi à l'entier inférieur. */
const EPSILON = 1e-6;

export interface PosAvailabilityOptions {
  /** Remplace le seuil par défaut ; 0 désactive l'état « bas ». */
  lowThreshold?: number;
}

/** Seuil « stock bas » : option de l'appelant, sinon POS_LOW_STOCK_UNITS, sinon la valeur par défaut. */
export function resolveLowThreshold(options?: PosAvailabilityOptions, env: NodeJS.ProcessEnv = process.env): number {
  const candidates = [options?.lowThreshold, env.POS_LOW_STOCK_UNITS == null || env.POS_LOW_STOCK_UNITS === '' ? undefined : Number(env.POS_LOW_STOCK_UNITS)];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  }
  return POS_DEFAULT_LOW_STOCK_UNITS;
}

/** null = non calculable (aucun stock suivi) : l'article reste vendable. */
export function classifyAvailability(remainingUnits: number | null, lowThreshold: number): PosAvailability {
  if (remainingUnits == null) return 'available';
  if (remainingUnits <= 0) return 'out';
  if (remainingUnits <= lowThreshold) return 'low';
  return 'available';
}

/**
 * Stock total d'une clé en unités de vente, casse de pack comprise : un pack entamé compte pour
 * ses unités (packed x unitsPerPack + vrac). Sans taille de pack connue, un pack compte pour une
 * unité (même lecture que la vue Logistic, qui ne peut pas fractionner un pack sans taille).
 */
export function totalUnitsOf(level: { packed: number; loose: number; unitsPerPack: number | null }): number {
  const perPack = level.unitsPerPack && level.unitsPerPack > 0 ? level.unitsPerPack : 1;
  return Math.max(0, level.packed * perPack + level.loose);
}

/**
 * Unités encore vendables d'un article par inversion de sa recette.
 * `perUnit` : besoin en stock par unité vendue (clé de stock -> quantité). `stock` : stock courant
 * par clé SUIVIE du PdV (une clé absente n'est pas suivie).
 * - minimum, sur les composants suivis, de floor(stock / besoin) ;
 * - un composant non suivi ne borne rien (eau, sauce hors inventaire) ;
 * - aucun composant suivi, ou recette inconnue : null (non calculable).
 */
export function remainingUnitsFor(perUnit: Map<string, number> | undefined, stock: Map<string, number>): number | null {
  if (!perUnit || !perUnit.size) return null;
  let minimum: number | null = null;
  for (const [key, need] of perUnit) {
    if (!(need > 0)) continue;
    const available = stock.get(key);
    if (available === undefined) continue;
    const units = Math.floor(available / need + EPSILON);
    minimum = minimum === null ? units : Math.min(minimum, units);
  }
  return minimum;
}
