import { ComponentNode, componentShares } from '../analyse/recipe-breakdown';

/** Part d'un composant portée par un ingrédient (ingredientId null : part sans ingrédient connu). */
export interface ComponentLeaf {
  ingredientId: string | null;
  share: number;
}

/**
 * Ingrédients qui portent le coût d'un composant (sous-composants dépliés), avec leur part (somme = 1).
 * Réutilise `componentShares` de l'Analyse : le noeud doit être construit avec
 * `ingredient.partner.supplierId` = id de l'ingrédient (le « partenaire » sert ici de porteur d'id).
 * Un composant inconnu ou à coût nul donne une unique part sans ingrédient.
 */
export function componentLeaves(componentId: string, nodes: Map<string, ComponentNode>): ComponentLeaf[] {
  const merged = new Map<string | null, number>();
  for (const s of componentShares(componentId, nodes)) {
    const id = s.partner?.supplierId ?? null;
    merged.set(id, (merged.get(id) ?? 0) + s.share);
  }
  return [...merged.entries()].map(([ingredientId, share]) => ({ ingredientId, share }));
}
