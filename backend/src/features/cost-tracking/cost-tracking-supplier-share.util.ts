import { brickKey, supplierKeyOf } from './cost-tracking-brick-scope.util';
import { ComponentLeaf } from './cost-tracking-component-leaves.util';
import { priceHt } from './cost-tracking-series.util';
import { BrickSnapshotPoint, SeriesPoint, SnapshotWithRecipe } from './cost-tracking.types';

/** Clé de la part de coût qu'aucun fournisseur ne porte (combo, brique sans historique ou sans fournisseur). */
export const NO_SUPPLIER = '__none__';

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Données de contexte : versions de coût des briques (clé `kind:refId`) et ingrédients porteurs de chaque composant. */
export interface SupplierShareContext {
  brickVersions: Map<string, BrickSnapshotPoint[]>;
  leaves: Map<string, ComponentLeaf[]>;
}

export interface SupplierShareSeries {
  name: string;
  points: SeriesPoint[];
}

interface Attribution {
  key: string;
  name: string;
}

const UNATTRIBUTED: Attribution = { key: NO_SUPPLIER, name: '' };

/**
 * Fournisseur d'une brique à l'instant `at` : sa dernière version de date <= at. Avant sa première version
 * (historique des briques plus récent que celui des articles), on prend la première version.
 */
function supplierAt(versions: BrickSnapshotPoint[] | undefined, at: number): Attribution {
  if (!versions?.length) return UNATTRIBUTED;
  let found = versions[0];
  for (const v of versions) {
    if (v.effectiveFrom.getTime() <= at) found = v;
    else break;
  }
  const key = supplierKeyOf(found.supplierId, found.supplierName);
  return key ? { key, name: found.supplierName ?? key } : UNATTRIBUTED;
}

/** Briques dont le fournisseur peut changer le partage d'une recette (lignes directes et ingrédients des composants). */
function relevantBrickKeys(versions: SnapshotWithRecipe[], ctx: SupplierShareContext): string[] {
  const keys = new Set<string>();
  for (const snap of versions) {
    for (const line of snap.recipe) {
      if (line.kind === 'ingredient' || line.kind === 'packaging') keys.add(brickKey(line.kind, line.refId));
      else if (line.kind === 'component') {
        keys.add(brickKey('component', line.refId));
        for (const leaf of ctx.leaves.get(line.refId) ?? []) if (leaf.ingredientId) keys.add(brickKey('ingredient', leaf.ingredientId));
      }
    }
  }
  return [...keys];
}

/** Parts de coût par pièce d'une version d'article, par fournisseur, à l'instant `at`. La somme vaut `costPerPiece`. */
export function sharesAt(version: SnapshotWithRecipe, at: number, ctx: SupplierShareContext): Map<string, { name: string; amount: number }> {
  const out = new Map<string, { name: string; amount: number }>();
  const add = (who: Attribution, amount: number) => {
    if (!(amount > 0)) return;
    const cur = out.get(who.key) ?? { name: who.name, amount: 0 };
    cur.amount += amount;
    out.set(who.key, cur);
  };
  const pieces = Math.max(version.numberOfPieces || 1, 1);
  let attributed = 0;
  for (const line of version.recipe) {
    const amount = ((line.quantity || 0) * (line.unitCost ?? 0)) / pieces;
    if (!(amount > 0)) continue;
    attributed += amount;
    if (line.kind === 'ingredient' || line.kind === 'packaging') {
      add(supplierAt(ctx.brickVersions.get(brickKey(line.kind, line.refId)), at), amount);
    } else if (line.kind === 'component') {
      const leaves = ctx.leaves.get(line.refId);
      if (leaves?.length) {
        for (const leaf of leaves) {
          const who = leaf.ingredientId ? supplierAt(ctx.brickVersions.get(brickKey('ingredient', leaf.ingredientId)), at) : UNATTRIBUTED;
          add(who, amount * leaf.share);
        }
      } else add(supplierAt(ctx.brickVersions.get(brickKey('component', line.refId)), at), amount);
    } else add(UNATTRIBUTED, amount);
  }
  // Coût de la version non couvert par les lignes (ligne sans coût figé, arrondi) : part sans fournisseur.
  add(UNATTRIBUTED, version.costPerPiece - attributed);
  return out;
}

/**
 * Séries en escalier de la part de coût par pièce d'UN article, pour chaque fournisseur (clé
 * `supplierKeyOf`, plus `NO_SUPPLIER`). À chaque instant (nouvelle version de l'article ou nouvelle
 * version d'une de ses briques sur la période), le coût de chaque ligne de la version en vigueur est
 * attribué au fournisseur de la brique à cet instant. Un composant se répartit entre les ingrédients
 * de sa composition ACTUELLE (pas d'historique de composition). `versions` : voir
 * `CostTrackingSnapshotReaderService.readRecipesForPeriod` (dernier snapshot avant `from` inclus).
 * Un fournisseur que l'article cesse d'utiliser reçoit un point `inactive` à 0 ; un fournisseur
 * jamais utilisé n'a pas de série.
 */
export function buildSupplierShareSeries(
  versions: SnapshotWithRecipe[],
  from: Date,
  ctx: SupplierShareContext,
  defaultVatRate: number | null = null,
): Map<string, SupplierShareSeries> {
  const out = new Map<string, SupplierShareSeries>();
  if (!versions.length) return out;
  const fromMs = from.getTime();
  const firstAt = Math.max(versions[0].effectiveFrom.getTime(), fromMs);
  const instants = new Set<number>();
  for (const v of versions) instants.add(Math.max(v.effectiveFrom.getTime(), fromMs));
  for (const key of relevantBrickKeys(versions, ctx)) {
    for (const bv of ctx.brickVersions.get(key) ?? []) {
      const t = bv.effectiveFrom.getTime();
      if (t >= firstAt) instants.add(t);
    }
  }
  for (const t of [...instants].sort((a, b) => a - b)) {
    let active = versions[0];
    for (const v of versions) {
      if (v.effectiveFrom.getTime() <= t) active = v;
      else break;
    }
    const carried = active.effectiveFrom.getTime() < fromMs && t === fromMs;
    const shares = sharesAt(active, t, ctx);
    const at = new Date(t).toISOString();
    for (const key of new Set([...out.keys(), ...shares.keys()])) {
      const share = shares.get(key);
      const entry = out.get(key) ?? { name: share?.name ?? '', points: [] };
      if (share?.name) entry.name = share.name;
      const prev = entry.points[entry.points.length - 1];
      const value = round4(share?.amount ?? 0);
      const vat = active.vatRate ?? defaultVatRate;
      if (value > 0) {
        if (!(prev && !prev.inactive && prev.costPerPiece === value && prev.price === active.basePrice)) {
          entry.points.push({
            at, costPerPiece: value, price: active.basePrice, priceHt: priceHt(active.basePrice, vat), articleCount: 1, carried,
            snapshotId: active.id, reason: active.reason, totalCost: round4(value * Math.max(active.numberOfPieces || 1, 1)), numberOfPieces: active.numberOfPieces,
          });
        }
      } else if (prev && !prev.inactive) {
        entry.points.push({ at, costPerPiece: 0, price: active.basePrice, priceHt: priceHt(active.basePrice, vat), articleCount: 1, carried: false, inactive: true, snapshotId: active.id, reason: active.reason });
      }
      if (entry.points.length) out.set(key, entry);
    }
  }
  return out;
}
