/**
 * Décomposition PURE du coût de recette d'un article par Market Price (règles 5 et 7).
 * Même base de coût que MenuItemCostService.refreshCosts : coût de recette de l'ingrédient /
 * de l'emballage, unitCost du composant, multipliés par le nombre d'unités de la ligne.
 * Un composant est ventilé sur ses propres ingrédients (et sous-composants) au prorata de
 * leur coût, pour retrouver la Market Price (industriel, fournisseur) qui le porte.
 */

export interface PartnerInfo {
  supplierId: string | null;
  supplierName: string | null;
  industrialId: string | null;
}

/** Part de coût rattachée à une Market Price (null : ligne sans Market Price connue). */
export interface CostPart {
  amount: number;
  partner: PartnerInfo | null;
}

export interface IngredientRef {
  costPerRecipeUnit: number;
  partner: PartnerInfo | null;
}

export interface ComponentNode {
  unitCost: number;
  ingredients: Array<{ quantity: number; ingredient: IngredientRef }>;
  children: Array<{ quantity: number; childId: string }>;
}

export interface RecipeLines {
  ingredients: Array<{ numberOfUnits: number; ingredient: IngredientRef }>;
  packagings: Array<{ numberOfUnits: number; packaging: IngredientRef }>;
  components: Array<{ numberOfUnits: number; componentId: string }>;
}

const MAX_DEPTH = 6;

/** Parts d'UN composant, normalisées pour que leur somme vaille 1 (garde anti-cycle par profondeur et pile). */
export function componentShares(
  componentId: string,
  components: Map<string, ComponentNode>,
  stack: string[] = [],
): Array<{ share: number; partner: PartnerInfo | null }> {
  const node = components.get(componentId);
  if (!node || stack.includes(componentId) || stack.length >= MAX_DEPTH) return [{ share: 1, partner: null }];
  const weighted: Array<{ weight: number; partner: PartnerInfo | null }> = [];
  for (const line of node.ingredients) {
    weighted.push({ weight: Math.max(0, line.quantity * line.ingredient.costPerRecipeUnit), partner: line.ingredient.partner });
  }
  for (const child of node.children) {
    const childNode = components.get(child.childId);
    const childWeight = Math.max(0, child.quantity * (childNode?.unitCost ?? 0));
    for (const part of componentShares(child.childId, components, [...stack, componentId])) {
      weighted.push({ weight: childWeight * part.share, partner: part.partner });
    }
  }
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  if (!weighted.length || total <= 0) return [{ share: 1, partner: null }];
  return weighted.map((w) => ({ share: w.weight / total, partner: w.partner }));
}

/** Parts de coût d'une recette COMPLÈTE (lot de `numberOfPiecesRecipe` pièces). */
export function recipeCostParts(recipe: RecipeLines, components: Map<string, ComponentNode>): CostPart[] {
  const parts: CostPart[] = [];
  for (const l of recipe.ingredients) {
    parts.push({ amount: l.ingredient.costPerRecipeUnit * l.numberOfUnits, partner: l.ingredient.partner });
  }
  for (const l of recipe.packagings) {
    parts.push({ amount: l.packaging.costPerRecipeUnit * l.numberOfUnits, partner: l.packaging.partner });
  }
  for (const l of recipe.components) {
    const node = components.get(l.componentId);
    const amount = (node?.unitCost ?? 0) * l.numberOfUnits;
    for (const s of componentShares(l.componentId, components)) {
      parts.push({ amount: amount * s.share, partner: s.partner });
    }
  }
  return parts;
}

/** Coût par unité vendue et par fournisseur (règle 7). Fournisseur inconnu : supplierId et name null. */
export function supplierCostsPerUnit(
  parts: CostPart[],
  pieces: number,
): Array<{ supplierId: string | null; name: string | null; unitCost: number }> {
  const divisor = Math.max(pieces, 1);
  const grouped = new Map<string, { supplierId: string | null; name: string | null; amount: number }>();
  for (const p of parts) {
    if (!(p.amount > 0)) continue;
    const supplierId = p.partner?.supplierId ?? null;
    const name = p.partner?.supplierName ?? null;
    const key = supplierId ?? (name ? `name:${name}` : 'unknown');
    const cur = grouped.get(key) ?? { supplierId, name, amount: 0 };
    cur.amount += p.amount;
    grouped.set(key, cur);
  }
  return [...grouped.values()]
    .map((g) => ({ supplierId: g.supplierId, name: g.name, unitCost: Math.round((g.amount / divisor) * 10000) / 10000 }))
    .sort((a, b) => b.unitCost - a.unitCost);
}

/**
 * Parts par industriel au prorata du coût de recette (règle 5). Seules les lignes portant un
 * industriel participent : la somme des parts vaut 1, et le résultat est vide si aucune ligne
 * n'a d'industriel (le front affiche alors « Non renseigné »). Si ces lignes ont toutes un coût
 * nul, le partage est égal entre les lignes.
 */
export function industrialSharesOf(parts: CostPart[]): Array<{ industrialId: string; share: number }> {
  const withIndustrial = parts.filter((p) => !!p.partner?.industrialId);
  if (!withIndustrial.length) return [];
  const total = withIndustrial.reduce((s, p) => s + Math.max(0, p.amount), 0);
  const grouped = new Map<string, number>();
  for (const p of withIndustrial) {
    const w = total > 0 ? Math.max(0, p.amount) / total : 1 / withIndustrial.length;
    grouped.set(p.partner!.industrialId!, (grouped.get(p.partner!.industrialId!) ?? 0) + w);
  }
  return [...grouped.entries()]
    .map(([industrialId, share]) => ({ industrialId, share: Math.round(share * 10000) / 10000 }))
    .filter((s) => s.share > 0)
    .sort((a, b) => b.share - a.share);
}

/** Poids des enfants d'un combo : prorata de (prix × quantité). Prix tous nuls : prorata des quantités. */
export function comboWeights(children: Array<{ menuItemId: string; quantity: number; price: number }>): Array<{ menuItemId: string; weight: number }> {
  if (!children.length) return [];
  const base = children.map((c) => Math.max(0, c.price) * Math.max(0, c.quantity));
  let total = base.reduce((s, v) => s + v, 0);
  let values = base;
  if (total <= 0) {
    values = children.map((c) => Math.max(0, c.quantity));
    total = values.reduce((s, v) => s + v, 0);
  }
  if (total <= 0) return children.map((c) => ({ menuItemId: c.menuItemId, weight: 1 / children.length }));
  return children.map((c, i) => ({ menuItemId: c.menuItemId, weight: Math.round((values[i] / total) * 10000) / 10000 }));
}
