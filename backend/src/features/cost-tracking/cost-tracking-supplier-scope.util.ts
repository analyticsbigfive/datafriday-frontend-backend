import { brickKey, supplierKeyOf, SupplierOption } from './cost-tracking-brick-scope.util';
import { ComponentLeaf } from './cost-tracking-component-leaves.util';
import { BrickSnapshotPoint, RecipeLine } from './cost-tracking.types';

/** Fournisseur actif sur la période : articles et briques (composants compris) qu'il fournit à un moment. */
export interface SupplierScopeEntry {
  key: string;
  name: string;
  articleIds: Set<string>;
  brickKeys: Set<string>;
}

/** Identifiants des composants des recettes. */
export function componentIdsOf(recipes: Map<string, RecipeLine[]>): string[] {
  const ids = new Set<string>();
  for (const lines of recipes.values()) for (const l of lines) if (l.kind === 'component') ids.add(l.refId);
  return [...ids];
}

/** Identifiants des ingrédients qui portent les composants (versions à lire en plus des briques des recettes). */
export function leafIngredientIds(leaves: Map<string, ComponentLeaf[]>): string[] {
  const ids = new Set<string>();
  for (const list of leaves.values()) for (const l of list) if (l.ingredientId) ids.add(l.ingredientId);
  return [...ids];
}

/**
 * Fournisseurs rencontrés sur la période (versions de brique lues, dont la dernière antérieure au début),
 * avec les articles de `recipes` qui les utilisent. Ligne ingrédient ou emballage : fournisseur de la brique.
 * Ligne composant : fournisseurs des ingrédients de sa composition, ou, sans composition connue, celui du composant.
 */
export function collectSupplierScope(
  recipes: Map<string, RecipeLine[]>,
  versions: Map<string, BrickSnapshotPoint[]>,
  leaves: Map<string, ComponentLeaf[]>,
): Map<string, SupplierScopeEntry> {
  const out = new Map<string, SupplierScopeEntry>();
  const credit = (articleId: string, sources: string[], credited: string[]) => {
    for (const source of sources) {
      for (const v of versions.get(source) ?? []) {
        const key = supplierKeyOf(v.supplierId, v.supplierName);
        if (!key) continue;
        const entry = out.get(key) ?? { key, name: v.supplierName ?? key, articleIds: new Set<string>(), brickKeys: new Set<string>() };
        if (v.supplierName) entry.name = v.supplierName;
        entry.articleIds.add(articleId);
        for (const c of credited) entry.brickKeys.add(c);
        out.set(key, entry);
      }
    }
  };
  for (const [articleId, lines] of recipes) {
    for (const line of lines) {
      if (line.kind === 'ingredient' || line.kind === 'packaging') {
        const key = brickKey(line.kind, line.refId);
        credit(articleId, [key], [key]);
      } else if (line.kind === 'component') {
        const own = brickKey('component', line.refId);
        const leafKeys = (leaves.get(line.refId) ?? []).filter((l) => l.ingredientId).map((l) => brickKey('ingredient', l.ingredientId!));
        if (leafKeys.length) credit(articleId, leafKeys, [...leafKeys, own]);
        else credit(articleId, [own], [own]);
      }
    }
  }
  return out;
}

/** Liste déroulante des fournisseurs, triée par nom. `brickCount` : briques (composants compris) fournies sur la période. */
export function supplierOptionsOf(scope: Map<string, SupplierScopeEntry>): SupplierOption[] {
  return [...scope.values()]
    .map((e) => ({ key: e.key, name: e.name, brickCount: e.brickKeys.size }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}
